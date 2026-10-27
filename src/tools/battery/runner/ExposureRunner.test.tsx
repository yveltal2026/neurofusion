// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPOSURE_SECONDS } from "../engine";
import type { ExposurePiece } from "../participant";
import { ExposureRunner } from "./ExposureRunner";

// Los reintentos son reales pero sin esperar entre intentos.
vi.mock("@/tools/iat/runner/api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/tools/iat/runner/api")>();
  return {
    ...actual,
    withRetry: ((fn, o) =>
      actual.withRetry(fn, {
        ...o,
        baseDelayMs: 0,
      })) as typeof actual.withRetry,
  };
});

const TOKEN = "b".repeat(43);
const BATTERY_SESSION = "22222222-2222-4222-8222-222222222222";
const STUDY = "33333333-3333-4333-8333-333333333333";
const EXPOSURE_SESSION = "44444444-4444-4444-8444-444444444444";

const pieces: ExposurePiece[] = [
  {
    id: "p1",
    title: "Nombre interno A",
    url: "https://signed.test/a.webp",
    width: 1200,
    height: 628,
  },
  {
    id: "p2",
    title: "Nombre interno B",
    url: "https://signed.test/b.webp",
    width: 1080,
    height: 1080,
  },
];

type Call = { path: string; body: Record<string, unknown> };

function server(
  opts: { startFailures?: number; completeFailures?: number } = {},
) {
  const calls: Call[] = [];
  let startFailures = opts.startFailures ?? 0;
  let completeFailures = opts.completeFailures ?? 0;
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status });
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path, body });
    if (path.endsWith("/exposure/start")) {
      if (startFailures-- > 0)
        return json(
          { ok: false, code: "server_error", message: "falló el inicio" },
          500,
        );
      return json({ ok: true, sessionId: EXPOSURE_SESSION });
    }
    if (path.endsWith("/exposure/complete")) {
      if (completeFailures-- > 0)
        return json(
          { ok: false, code: "server_error", message: "falló el cierre" },
          500,
        );
      return json({ ok: true });
    }
    return json({ ok: false, code: "not_found", message: "x" }, 404);
  };
  return { calls, fetchImpl };
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
const loadImage = () => act(() => void fireEvent.load(screen.getByRole("img")));
const button = () => screen.getByRole("button") as HTMLButtonElement;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup(
  props: Partial<Parameters<typeof ExposureRunner>[0]> = {},
  srv = server(),
) {
  vi.stubGlobal("fetch", vi.fn(srv.fetchImpl));
  const onComplete = vi.fn();
  render(
    <ExposureRunner
      token={TOKEN}
      batterySessionId={BATTERY_SESSION}
      studyId={STUDY}
      pieces={pieces}
      preview={false}
      onComplete={onComplete}
      {...props}
    />,
  );
  return { srv, onComplete };
}

describe("ExposureRunner", () => {
  it("abre la sesión del paso, muestra cada pieza el tiempo mínimo y cierra el paso al final", async () => {
    const { srv, onComplete } = setup();
    await tick(0);
    expect(srv.calls).toEqual([
      {
        path: `/api/b/${TOKEN}/exposure/start`,
        body: { sessionId: BATTERY_SESSION, studyId: STUDY },
      },
    ]);

    // Pieza 1: el botón no se habilita hasta que cargó la imagen y pasaron los segundos.
    expect(screen.getByText("Imagen 1 de 2")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Mira con atención" }),
    ).toBeTruthy();
    await tick(EXPOSURE_SECONDS * 1000 + 3000);
    expect(button().disabled).toBe(true);
    expect(button().textContent).toBe("Cargando imagen…");
    loadImage();
    expect(button().textContent).toBe(
      `Podrás continuar en ${EXPOSURE_SECONDS} s`,
    );
    await tick((EXPOSURE_SECONDS - 1) * 1000);
    expect(button().disabled).toBe(true);
    await tick(1000);
    expect(button().disabled).toBe(false);
    expect(button().textContent).toBe("Siguiente imagen");
    act(() => void fireEvent.click(button()));

    // Pieza 2 (la última): empieza de cero y termina con «Continuar».
    expect(screen.getByText("Imagen 2 de 2")).toBeTruthy();
    expect(button().disabled).toBe(true);
    loadImage();
    await tick(EXPOSURE_SECONDS * 1000);
    expect(button().textContent).toBe("Continuar");
    expect(onComplete).not.toHaveBeenCalled();
    act(() => void fireEvent.click(button()));
    await tick(0);

    expect(srv.calls.at(-1)).toEqual({
      path: `/api/b/${TOKEN}/exposure/complete`,
      body: { sessionId: BATTERY_SESSION, exposureSessionId: EXPOSURE_SESSION },
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("no revela el nombre interno de la pieza al participante", async () => {
    setup();
    await tick(0);
    expect(document.body.textContent).not.toContain("Nombre interno");
    expect(screen.getByRole("img").getAttribute("src")).toBe(pieces[0]!.url);
  });

  it("con una sola pieza no numera las imágenes", async () => {
    setup({ pieces: [pieces[0]!] });
    await tick(0);
    expect(screen.queryByText(/Imagen 1 de/)).toBeNull();
  });

  it("vista previa: no llama al servidor y avanza con una cuenta corta", async () => {
    const { srv, onComplete } = setup({ preview: true, pieces: [pieces[0]!] });
    await tick(0);
    loadImage();
    await tick(1000);
    act(() => void fireEvent.click(button()));
    await tick(0);
    expect(srv.calls).toEqual([]);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("si falla abrir el paso, muestra el mensaje y deja reintentar", async () => {
    const { srv } = setup({}, server({ startFailures: 3 }));
    await tick(100);
    expect(screen.getByText("falló el inicio")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    act(
      () =>
        void fireEvent.click(
          screen.getByRole("button", { name: "Reintentar" }),
        ),
    );
    await tick(0);
    expect(screen.getByRole("img")).toBeTruthy();
    expect(
      srv.calls.filter((c) => c.path.endsWith("/exposure/start")).length,
    ).toBe(4);
  });

  it("si falla el cierre, deja reintentar sin repetir la exposición", async () => {
    const { srv, onComplete } = setup(
      { pieces: [pieces[0]!] },
      server({ completeFailures: 5 }),
    );
    await tick(0);
    loadImage();
    await tick(EXPOSURE_SECONDS * 1000);
    act(() => void fireEvent.click(button()));
    await tick(100);
    expect(screen.getByText("falló el cierre")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    act(
      () =>
        void fireEvent.click(
          screen.getByRole("button", { name: "Reintentar" }),
        ),
    );
    await tick(100);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(
      srv.calls.filter((c) => c.path.endsWith("/exposure/start")).length,
    ).toBe(1);
  });

  it("si la imagen no carga, ofrece reintentar y la cuenta sólo corre cuando carga", async () => {
    setup({ pieces: [pieces[0]!] });
    await tick(0);
    act(() => void fireEvent.error(screen.getByRole("img")));
    expect(screen.getByText("No pudimos cargar la imagen.")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: /Cargando imagen/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    act(
      () =>
        void fireEvent.click(
          screen.getByRole("button", { name: "Reintentar" }),
        ),
    );
    expect(screen.getByRole("img")).toBeTruthy();
    loadImage();
    await tick(EXPOSURE_SECONDS * 1000);
    expect(
      (screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("sin imágenes avisa y no abre ninguna sesión", async () => {
    const { srv, onComplete } = setup({ pieces: [] });
    await tick(0);
    expect(screen.getByText(/no tiene imágenes que mostrar/)).toBeTruthy();
    expect(srv.calls).toEqual([]);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
