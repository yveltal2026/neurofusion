// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoConfig } from "@/tools/iat/demo";
import { DEFAULT_THANK_YOU, defaultConsentText } from "@/tools/survey/engine";
import { defaultBatteryConsent, DEFAULT_BATTERY_THANK_YOU } from "../engine/config";
import type { BatteryStep } from "../server";
import { BatteryRunner } from "./BatteryRunner";

// Los runners hijos ya tienen sus propias pruebas del modo incrustado: aquí se sustituyen por un botón que termina el paso.
vi.mock("@/tools/iat/runner/Runner", () => ({
  Runner: ({ token, embedded, preview }: { token: string; preview: boolean; embedded?: { batterySessionId: string; onComplete: () => void } }) => (
    <div data-testid="step-iat" data-token={token} data-battery={embedded?.batterySessionId} data-preview={String(preview)}>
      <button onClick={() => embedded?.onComplete()}>Terminar IAT</button>
    </div>
  ),
}));
vi.mock("@/tools/survey/runner/SurveyRunner", () => ({
  SurveyRunner: ({ token, embedded }: { token: string; embedded?: { batterySessionId: string; onComplete: () => void } }) => (
    <div data-testid="step-survey" data-token={token} data-battery={embedded?.batterySessionId}>
      <button onClick={() => embedded?.onComplete()}>Terminar encuesta</button>
    </div>
  ),
}));
vi.mock("@/tools/iat/runner/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/tools/iat/runner/api")>();
  return { ...actual, withRetry: ((fn, o) => actual.withRetry(fn, { ...o, baseDelayMs: 0 })) as typeof actual.withRetry };
});

const TOKEN = "b".repeat(43);
const SESSION = "11111111-1111-4111-8111-111111111111";

const steps: BatteryStep[] = [
  { position: 0, studyId: "s-iat", tool: "iat", name: "IAT", status: "published", token: "i".repeat(43), config: demoConfig() },
  {
    position: 1,
    studyId: "s-sv",
    tool: "survey",
    name: "Encuesta",
    status: "published",
    token: "s".repeat(43),
    config: {
      version: 1,
      title: "Encuesta",
      texts: { consent: defaultConsentText("Encuesta"), thankYou: DEFAULT_THANK_YOU },
      blocks: [{ kind: "instrument", id: "nps", instrumentId: "nps", required: true }],
    },
  },
];
const config = { version: 1 as const, texts: { consent: defaultBatteryConsent("Mi estudio"), thankYou: DEFAULT_BATTERY_THANK_YOU } };

interface ServerOpts {
  progress?: object | { code: string };
  startCode?: string;
  completeCodes?: string[];
}

function fakeServer(opts: ServerOpts = {}) {
  const calls: { path: string; body: unknown }[] = [];
  const completeCodes = [...(opts.completeCodes ?? [])];
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
  const fail = (code: string, status = 409) => json({ ok: false, code, message: `msg:${code}` }, status);
  const impl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname.replace(/^\/api\/b\/[^/]+/, "");
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (path === "/progress") {
      const p = opts.progress ?? { code: "not_found" };
      return "code" in p ? fail((p as { code: string }).code, 404) : json({ ok: true, batterySessionId: SESSION, ...p });
    }
    if (path === "/start") return opts.startCode ? fail(opts.startCode) : json({ ok: true, batterySessionId: SESSION });
    if (path === "/complete") {
      const code = completeCodes.shift();
      return code ? fail(code, code === "server_error" ? 500 : 409) : json({ ok: true });
    }
    return fail("not_found", 404);
  };
  return { calls, impl };
}

const renderRunner = (preview = false) => render(<BatteryRunner token={TOKEN} name="Mi estudio" config={config} steps={steps} preview={preview} />);
const paths = (c: { path: string }[]) => c.map((x) => x.path);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BatteryRunner", () => {
  it("recorre consentimiento → IAT → encuesta → gracias y cierra la batería en el servidor", async () => {
    const s = fakeServer();
    vi.stubGlobal("fetch", s.impl);
    const user = userEvent.setup();
    renderRunner();

    // Bienvenida con consentimiento y la lista de actividades.
    expect(await screen.findByRole("heading", { name: "Mi estudio" })).toBeTruthy();
    expect(screen.getByLabelText("Actividades").textContent).toContain("Test de asociación");
    expect((screen.getByRole("button", { name: "Comenzar" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Comenzar" }));

    // Paso 1: IAT incrustado, enlazado a la sesión de batería con la liga de su propio estudio.
    expect(await screen.findByText("Actividad 1 de 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    const iat = await screen.findByTestId("step-iat");
    expect(iat.dataset.token).toBe("i".repeat(43));
    expect(iat.dataset.battery).toBe(SESSION);
    expect(iat.dataset.preview).toBe("false");
    await user.click(screen.getByRole("button", { name: "Terminar IAT" }));

    // Paso 2: encuesta.
    expect(await screen.findByText("Actividad 2 de 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect((await screen.findByTestId("step-survey")).dataset.token).toBe("s".repeat(43));
    await user.click(screen.getByRole("button", { name: "Terminar encuesta" }));

    expect(await screen.findByTestId("thanks")).toBeTruthy();
    expect(screen.getByTestId("thanks").textContent).toContain(DEFAULT_BATTERY_THANK_YOU);
    expect(paths(s.calls)).toEqual(["/progress", "/start", "/complete"]);
    expect(s.calls[1]!.body).toEqual({ consent: true, device: { deviceType: "desktop" } });
  });

  it("al recargar retoma en el primer paso sin completar", async () => {
    const s = fakeServer({
      progress: {
        sessionStatus: "started",
        steps: [
          { studyId: "s-iat", status: "completed" },
          { studyId: "s-sv", status: "pending" },
        ],
        nextIndex: 1,
      },
    });
    vi.stubGlobal("fetch", s.impl);
    renderRunner();
    expect(await screen.findByText("Actividad 2 de 2")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(paths(s.calls)).toEqual(["/progress"]); // no vuelve a abrir sesión
  });

  it("si la batería ya estaba completa, muestra el agradecimiento", async () => {
    const s = fakeServer({ progress: { sessionStatus: "completed", steps: [], nextIndex: null } });
    vi.stubGlobal("fetch", s.impl);
    renderRunner();
    expect(await screen.findByTestId("thanks")).toBeTruthy();
  });

  it("si la batería no está disponible, lo dice desde el principio", async () => {
    const s = fakeServer({ progress: { code: "not_available" } });
    vi.stubGlobal("fetch", s.impl);
    renderRunner();
    expect((await screen.findByTestId("blocked")).textContent).toBe("msg:not_available");
  });

  it("si el servidor rechaza el inicio (ya participó), muestra el motivo y no avanza", async () => {
    const s = fakeServer({ startCode: "already_participated" });
    vi.stubGlobal("fetch", s.impl);
    const user = userEvent.setup();
    renderRunner();
    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Comenzar" }));
    expect((await screen.findByTestId("blocked")).textContent).toBe("msg:already_participated");
  });

  it("si el cierre falla (servidor caído) ofrece Reintentar y no pierde nada", async () => {
    const s = fakeServer({ completeCodes: ["server_error", "server_error", "server_error", "server_error", "server_error"] });
    vi.stubGlobal("fetch", s.impl);
    const user = userEvent.setup();
    renderRunner();
    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Comenzar" }));
    for (const done of ["Terminar IAT", "Terminar encuesta"]) {
      await user.click(await screen.findByRole("button", { name: "Continuar" }));
      await user.click(await screen.findByRole("button", { name: done }));
    }
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeTruthy();
    expect(screen.getByText(/no cierres esta ventana/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByTestId("thanks")).toBeTruthy());
  });

  it("vista previa: recorre todo sin llamar jamás al servidor", async () => {
    const s = fakeServer();
    vi.stubGlobal("fetch", s.impl);
    const user = userEvent.setup();
    renderRunner(true);
    expect(screen.getByText(/Vista previa/)).toBeTruthy();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Comenzar" }));
    for (const done of ["Terminar IAT", "Terminar encuesta"]) {
      await user.click(await screen.findByRole("button", { name: "Continuar" }));
      const step = await screen.findByRole("button", { name: done });
      expect(step).toBeTruthy();
      await user.click(step);
    }
    expect(await screen.findByTestId("thanks")).toBeTruthy();
    expect(s.calls).toEqual([]);
  });
});
