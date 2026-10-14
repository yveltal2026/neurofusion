// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConsentText, defaultIatConfig, type IatConfig } from "../config";
import { mulberry32 } from "../engine/rng";
import type { PlannedBlock, PlannedTrial, Side } from "../engine/types";
import { buildParticipantSchema, splitParticipantPayload, type ParticipantPayload } from "../participant";
import {
  buildTrialRows,
  counterbalanceSchema,
  newCounterbalance,
  planForDimension,
  scoreSession,
  trialBatchSchema,
  type CounterbalanceEntry,
  type StoredTrial,
} from "../session";
import { Runner } from "./Runner";

const TOKEN = "t".repeat(43);

function makeConfig(): IatConfig {
  return {
    ...defaultIatConfig(),
    product: "café de especialidad",
    protocol: "demo5",
    conceptA: { label: "Marca A", stimuli: ["Marca A"] },
    conceptB: { label: "Marca B", stimuli: ["Marca B"] },
    dimensions: [
      {
        id: "confianza",
        name: "Confianza",
        positiveLabel: "Confiable",
        negativeLabel: "Poco confiable",
        positiveWords: ["Seguro", "Honesto", "Sólido", "Estable", "Fiable"],
        negativeWords: ["Riesgoso", "Engañoso", "Frágil", "Inestable", "Dudoso"],
      },
    ],
    participant: {
      collectAge: true,
      collectGender: true,
      explicitQuestion: "¿Cuál prefieres?",
      extraFields: [{ id: "frecuencia", label: "Frecuencia", type: "select", options: ["Diario", "Semanal"], required: true }],
    },
    texts: { consent: defaultConsentText("café"), thankYou: "Gracias por tu tiempo." },
  };
}

/**
 * Servidor falso en memoria. Replica la lógica de las rutas /api/s/[token]/* usando las
 * MISMAS funciones puras (esquemas, plan por semilla, validación de lote, puntuación), de
 * modo que esta prueba verifica el contrato cliente↔servidor. La capa de BD (Supabase)
 * no se ejercita aquí.
 */
function createFakeServer(config: IatConfig, opts: { checkError?: string; startError?: string } = {}) {
  const state = {
    counterbalance: [] as CounterbalanceEntry[],
    demographics: null as Record<string, unknown> | null,
    explicit: null as string | null,
    device: null as unknown,
    trials: [] as (StoredTrial & { pressed_side: Side; correct_side: Side })[],
    status: "none" as "none" | "started" | "completed",
    results: null as ReturnType<typeof scoreSession> | null,
    failTrialsTimes: 0,
    calls: [] as string[],
  };
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
  const err = (code: string, status: number) => json({ ok: false, code, message: `msg:${code}` }, status);

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname.replace(/^\/api\/s\/[^/]+/, "");
    state.calls.push(path);
    const body = init?.body ? JSON.parse(String(init.body)) : null;

    if (path === "/check") return opts.checkError ? err(opts.checkError, 409) : json({ ok: true });

    if (path === "/start") {
      if (opts.startError) return err(opts.startError, 409);
      const parsed = buildParticipantSchema(config).safeParse(body.participant);
      if (!parsed.success || body.consent !== true) return err("invalid_data", 422);
      const { explicit, demographics } = splitParticipantPayload(parsed.data as ParticipantPayload);
      state.demographics = demographics;
      state.explicit = explicit;
      state.device = body.device;
      state.counterbalance = newCounterbalance(config.dimensions.length, mulberry32(7));
      state.status = "started";
      return json({ ok: true, sessionId: "00000000-0000-4000-8000-000000000001", counterbalance: state.counterbalance });
    }

    if (path === "/trials") {
      if (state.failTrialsTimes > 0) {
        state.failTrialsTimes--;
        return err("server_error", 500);
      }
      const batch = trialBatchSchema.safeParse(body);
      if (!batch.success) return err("invalid_data", 422);
      const cb = counterbalanceSchema.parse(state.counterbalance);
      const plan = planForDimension(config, batch.data.dimensionIdx, cb[batch.data.dimensionIdx]);
      const built = buildTrialRows(plan, batch.data.dimensionIdx, batch.data.trials);
      if (!built.ok) return err("invalid_data", 422);
      for (const r of built.rows) {
        if (!state.trials.some((t) => t.dimension_idx === r.dimension_idx && t.block === r.block && (t as unknown as { trial_idx: number }).trial_idx === r.trial_idx)) {
          state.trials.push({ ...r, trial_idx: r.trial_idx } as never);
        }
      }
      return json({ ok: true, stored: built.rows.length });
    }

    if (path === "/complete") {
      if (state.status === "completed") return json({ ok: true });
      const scored = scoreSession(config, state.counterbalance, state.trials);
      if (!scored.complete) return err("incomplete", 409);
      state.results = scored;
      state.status = "completed";
      return json({ ok: true });
    }
    return err("not_found", 404);
  };
  return { state, fetchImpl };
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function pressKey(side: Side) {
  const ev = new KeyboardEvent("keydown", { code: side === "left" ? "KeyE" : "KeyI", bubbles: true });
  Object.defineProperty(ev, "timeStamp", { value: performance.now() });
  act(() => {
    window.dispatchEvent(ev);
  });
}

const click = (name: string | RegExp) => act(() => void fireEvent.click(screen.getByRole("button", { name })));

/** Consentimiento → formulario → (aviso de dispositivo táctil) → instrucciones. */
async function startSession(opts: { touch?: boolean } = {}) {
  await tick(0);
  act(() => void fireEvent.click(screen.getByRole("checkbox")));
  await click("Comenzar");
  act(() => {
    fireEvent.change(screen.getByLabelText(/Frecuencia/), { target: { value: "Diario" } });
    fireEvent.click(screen.getByRole("radio", { name: "Marca A" }));
  });
  await click("Continuar");
  await tick(0);
  if (opts.touch) await click("Continuar en este dispositivo");
  await click("Entendido, continuar");
}

/** Hace correr un bloque completo respondiendo según el plan, con RT dado por `rtFor`. */
async function playBlock(
  block: PlannedBlock,
  respond: (t: PlannedTrial) => { side: Side; rt: number; mistakeFirst?: boolean },
  press: (side: Side) => void,
) {
  await click("Comenzar");
  for (const trial of block.trials) {
    await tick(trial.index === 0 ? 500 : 250); // intervalo entre ensayos
    await tick(20); // el estímulo se pinta y se fija t0
    expect(screen.getByTestId("stimulus").textContent).toBe(trial.text); // el cliente sigue el plan del servidor
    const { side, rt, mistakeFirst } = respond(trial);
    await tick(rt);
    if (mistakeFirst) {
      press(trial.correctSide === "left" ? "right" : "left");
      expect(screen.getByTestId("error-mark").textContent).toBe("X");
      await tick(200);
    }
    press(side);
    // Tras el último ensayo el bloque se desmonta; en los demás, la X debe haberse ido.
    expect(screen.queryByTestId("error-mark")?.textContent ?? "").toBe("");
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Runner · flujo completo con teclado", () => {
  it("consentimiento → datos → test → guardado → agradecimiento; el servidor puntúa D>0", async () => {
    const config = makeConfig();
    const server = createFakeServer(config);
    vi.stubGlobal("fetch", vi.fn(server.fetchImpl));
    render(<Runner token={TOKEN} config={config} preview={false} />);

    // El botón de comenzar requiere consentimiento.
    expect((screen.getByRole("button", { name: "Comenzar" }) as HTMLButtonElement).disabled).toBe(true);
    await startSession();

    expect(server.state.status).toBe("started");
    expect(server.state.explicit).toBe("A");
    expect(server.state.demographics).toEqual({ frecuencia: "Diario" });
    expect(server.state.device).toMatchObject({ inputMode: "keyboard", deviceType: "desktop" });

    // Participante que asocia A con el polo positivo (más rápido en la combinación congruente).
    const plan = planForDimension(config, 0, server.state.counterbalance[0]);
    const aFirst = server.state.counterbalance[0].combo === "A_with_P1";
    let mistakes = 0;
    for (const block of plan) {
      const congruent = block.kind !== "combined" || aFirst === (block.block === 3 || block.block === 4);
      await playBlock(
        block,
        (t) => {
          // Un error deliberado en el primer ensayo del bloque 3 para comprobar la corrección.
          const mistakeFirst = block.block === 3 && t.index === 0;
          if (mistakeFirst) mistakes++;
          return { side: t.correctSide, rt: congruent ? 600 + (t.index % 7) * 30 : 850 + (t.index % 7) * 30, mistakeFirst };
        },
        pressKey,
      );
    }
    await tick(0);

    // Pantalla final: sólo agradecimiento, sin ningún resultado.
    expect(screen.getByTestId("thanks").textContent).toContain("Gracias por tu tiempo.");
    expect(document.body.textContent).not.toMatch(/D-score|puntuación|resultado/i);

    // Servidor: ensayos completos, sesión cerrada y puntuada.
    expect(server.state.trials).toHaveLength(60);
    expect(server.state.status).toBe("completed");
    expect(server.state.calls).toEqual(["/check", "/start", "/trials", "/complete"]);
    const results = server.state.results;
    expect(results?.complete).toBe(true);
    if (results?.complete) {
      expect(results.dimensions[0].score.d as number).toBeGreaterThan(0.35);
      expect(results.dimensions[0].score.interpretation?.direction).toBe("A");
      expect(results.dimensions[0].validity.valid).toBe(true);
    }
    // El error del primer ensayo del bloque 3 se registró como error (1.ª respuesta incorrecta).
    expect(mistakes).toBe(1);
    expect(server.state.trials.filter((t) => t.error)).toHaveLength(1);
  });

  it("si falla la red al guardar, ofrece Reintentar y no pierde las respuestas", async () => {
    const config = makeConfig();
    const server = createFakeServer(config);
    server.state.failTrialsTimes = 5; // agota los reintentos automáticos (1 + 4)
    vi.stubGlobal("fetch", vi.fn(server.fetchImpl));
    render(<Runner token={TOKEN} config={config} preview={false} />);
    await startSession();

    const plan = planForDimension(config, 0, server.state.counterbalance[0]);
    for (const block of plan) {
      await playBlock(block, (t) => ({ side: t.correctSide, rt: 700 + (t.index % 5) * 20 }), pressKey);
    }
    // Backoff 1+2+4+8 s de los reintentos automáticos.
    await tick(15_000);
    expect(screen.getByText("msg:server_error")).toBeTruthy();
    expect(server.state.trials).toHaveLength(0);

    server.state.failTrialsTimes = 0;
    await click("Reintentar");
    await tick(0);
    expect(server.state.trials).toHaveLength(60);
    expect(screen.getByTestId("thanks")).toBeTruthy();
    expect(server.state.status).toBe("completed");
  });
});

describe("Runner · bloqueos y modo vista previa", () => {
  it("muestra de inmediato 'ya participaste' si el pre-chequeo lo indica", async () => {
    const config = makeConfig();
    const server = createFakeServer(config, { checkError: "already_participated" });
    vi.stubGlobal("fetch", vi.fn(server.fetchImpl));
    render(<Runner token={TOKEN} config={config} preview={false} />);
    await tick(0);
    expect(screen.getByTestId("blocked").textContent).toBe("msg:already_participated");
  });

  it("si /start rechaza (estudio lleno), muestra el mensaje y no avanza", async () => {
    const config = makeConfig();
    const server = createFakeServer(config, { startError: "full" });
    vi.stubGlobal("fetch", vi.fn(server.fetchImpl));
    render(<Runner token={TOKEN} config={config} preview={false} />);
    await tick(0);
    act(() => void fireEvent.click(screen.getByRole("checkbox")));
    await click("Comenzar");
    act(() => {
      fireEvent.change(screen.getByLabelText(/Frecuencia/), { target: { value: "Diario" } });
      fireEvent.click(screen.getByRole("radio", { name: "Marca A" }));
    });
    await click("Continuar");
    await tick(0);
    expect(screen.getByTestId("blocked").textContent).toBe("msg:full");
  });

  it("el formulario valida obligatorios antes de llamar al servidor", async () => {
    const config = makeConfig();
    const server = createFakeServer(config);
    vi.stubGlobal("fetch", vi.fn(server.fetchImpl));
    render(<Runner token={TOKEN} config={config} preview={false} />);
    await tick(0);
    act(() => void fireEvent.click(screen.getByRole("checkbox")));
    await click("Comenzar");
    await click("Continuar"); // sin datos
    expect(screen.getAllByText(/obligatorio|Elige una opción/i).length).toBeGreaterThan(0);
    expect(server.state.calls).toEqual(["/check"]); // /start no se llamó
  });

  it("vista previa: corre el test sin llamar jamás al servidor", async () => {
    const config = makeConfig();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<Runner token={TOKEN} config={config} preview />);
    expect(screen.getByText(/Vista previa: no se guarda ningún dato/)).toBeTruthy();
    await startSession();
    // Primer ensayo del primer bloque, sólo para comprobar que el test arranca.
    await click("Comenzar");
    await tick(520);
    expect(screen.getByTestId("stimulus")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Runner · dispositivo táctil", () => {
  it("muestra el aviso de escritorio y responde con botones táctiles grandes", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {} }));
    Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
    Object.defineProperty(window.screen, "width", { value: 412, configurable: true });
    Object.defineProperty(window.screen, "height", { value: 915, configurable: true });

    const config = makeConfig();
    const server = createFakeServer(config);
    vi.stubGlobal("fetch", vi.fn(server.fetchImpl));
    render(<Runner token={TOKEN} config={config} preview={false} />);

    await tick(0);
    act(() => void fireEvent.click(screen.getByRole("checkbox")));
    await click("Comenzar");
    act(() => {
      fireEvent.change(screen.getByLabelText(/Frecuencia/), { target: { value: "Semanal" } });
      fireEvent.click(screen.getByRole("radio", { name: "Marca B" }));
    });
    await click("Continuar");
    await tick(0);

    // Aviso amable que recomienda computadora, pero permite continuar.
    expect(screen.getByText(/computadora con teclado/)).toBeTruthy();
    expect(server.state.device).toMatchObject({ inputMode: "touch", deviceType: "mobile", screenWidth: 412 });
    await click("Continuar en este dispositivo");
    expect(document.body.textContent).toContain("Toca el botón"); // instrucciones para pantalla táctil
    await click("Entendido, continuar");

    // Un bloque con taps: aparecen los dos botones y los pulgares registran respuestas.
    await click("Comenzar");
    const plan = planForDimension(config, 0, server.state.counterbalance[0]);
    const first = plan[0];
    for (const trial of first.trials.slice(0, 3)) {
      await tick(trial.index === 0 ? 500 : 250);
      await tick(20);
      expect(screen.getByTestId("stimulus").textContent).toBe(trial.text);
      await tick(650);
      act(() => void fireEvent.pointerDown(screen.getByTestId(`touch-${trial.correctSide}`), { isPrimary: true }));
    }
    // Tras 3 respuestas correctas el siguiente ensayo está en curso (aún sin X).
    await tick(270);
    expect(screen.getByTestId("stimulus").textContent).toBe(first.trials[3].text);
    // Un dedo secundario (multitáctil accidental) no cuenta como respuesta.
    act(() => void fireEvent.pointerDown(screen.getByTestId(`touch-${first.trials[3].correctSide}`), { isPrimary: false }));
    expect(screen.getByTestId("stimulus").textContent).toBe(first.trials[3].text);
    expect(screen.getByTestId("error-mark").textContent).toBe("");
    // Con el teclado inactivo en modo táctil, E/I no responden.
    const before = screen.getByTestId("stimulus").textContent;
    pressKey("left");
    pressKey("right");
    expect(screen.getByTestId("stimulus").textContent).toBe(before);
    expect(screen.getByTestId("error-mark").textContent).toBe("");
  });
});

describe("Runner · como paso de una batería", () => {
  it("empieza en el formulario (sin consentimiento propio), no hace pre-chequeo y enlaza la sesión a la batería", async () => {
    const config = makeConfig();
    const server = createFakeServer(config);
    const fetchSpy = vi.fn(server.fetchImpl);
    vi.stubGlobal("fetch", fetchSpy);
    const onComplete = vi.fn();
    render(<Runner token={TOKEN} config={config} preview={false} embedded={{ batterySessionId: "bat-1", onComplete }} />);

    await tick(0);
    // La bienvenida y el consentimiento los cubre la batería: se va directo al formulario.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("Antes de empezar")).toBeTruthy();

    act(() => {
      fireEvent.change(screen.getByLabelText(/Frecuencia/), { target: { value: "Diario" } });
      fireEvent.click(screen.getByRole("radio", { name: "Marca A" }));
    });
    await click("Continuar");
    await tick(0);

    const startCall = fetchSpy.mock.calls.find((c) => String(c[0]).endsWith("/start"));
    expect(startCall).toBeTruthy();
    expect(JSON.parse(String((startCall![1] as RequestInit).body)).batterySessionId).toBe("bat-1");
    expect(server.state.calls).not.toContain("/check");
    expect(onComplete).not.toHaveBeenCalled(); // aún no termina el test
  });

  it("sin batería no manda batterySessionId (comportamiento de siempre)", async () => {
    const config = makeConfig();
    const server = createFakeServer(config);
    const fetchSpy = vi.fn(server.fetchImpl);
    vi.stubGlobal("fetch", fetchSpy);
    render(<Runner token={TOKEN} config={config} preview={false} />);
    await startSession();
    const startCall = fetchSpy.mock.calls.find((c) => String(c[0]).endsWith("/start"));
    expect(JSON.parse(String((startCall![1] as RequestInit).body))).not.toHaveProperty("batterySessionId");
  });
});
