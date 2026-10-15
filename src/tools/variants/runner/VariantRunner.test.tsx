// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validVariantConfig } from "../defaults";
import { submitVariantResponses } from "../participant";
import { buildPlan, type GnatBlock, type PrimingBlock, type ScBlock, type VariantPlan } from "../plan";
import { VariantRunner } from "./VariantRunner";
import type { VariantConfig } from "../config";

const TOKEN = "t".repeat(43);
const SID = "11111111-2222-4333-8444-555555555555";

/** Servidor falso: usa la MISMA lógica de servidor (plan, validación, puntuación) con una base de datos en memoria. */
function createFakeServer(config: VariantConfig, opts: { checkError?: string; startError?: string } = {}) {
  const state = {
    status: "none" as "none" | "started" | "completed",
    result: null as Record<string, unknown> | null,
    calls: [] as string[],
    device: null as unknown,
    lastError: null as unknown,
  };
  const admin = {
    from: (table: string) =>
      table === "sessions"
        ? {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.status === "none" ? null : { id: SID, study_id: "s1", status: state.status }, error: null }) }) }),
            update: (patch: { status: "completed" }) => ({
              eq: () => ({
                eq: async () => {
                  state.status = patch.status;
                  return { error: null };
                },
              }),
            }),
          }
        : {
            upsert: async (row: Record<string, unknown>) => {
              state.result = row;
              return { error: null };
            },
          },
  } as unknown as SupabaseClient;
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
  const err = (code: string, status: number) => json({ ok: false, code, message: `msg:${code}` }, status);

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname.replace(/^\/api\/s\/[^/]+\/variant/, "");
    state.calls.push(path);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (path === "/check") return opts.checkError ? err(opts.checkError, 409) : json({ ok: true });
    if (path === "/start") {
      if (opts.startError) return err(opts.startError, 409);
      if (body.consent !== true) return err("invalid_data", 422);
      state.device = body.device;
      state.status = "started";
      return json({ ok: true, sessionId: SID });
    }
    if (path === "/submit") {
      const res = await submitVariantResponses(admin, { id: "s1", config }, body.sessionId, body.submission);
      state.lastError = res;
      return res.ok ? json({ ok: true }) : err(res.code, 422);
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

function pressCode(code: string) {
  const ev = new KeyboardEvent("keydown", { code, bubbles: true });
  Object.defineProperty(ev, "timeStamp", { value: performance.now() });
  act(() => {
    window.dispatchEvent(ev);
  });
}
const pressSide = (side: "left" | "right") => pressCode(side === "left" ? "KeyE" : "KeyI");
const pressGo = () => pressCode("Space");

const click = (name: string | RegExp) => act(() => void fireEvent.click(screen.getByRole("button", { name })));

/** Consentimiento → inicio de sesión → instrucciones generales → primera pantalla de bloque. */
async function startSession() {
  await tick(0);
  act(() => void fireEvent.click(screen.getByRole("checkbox")));
  await click("Comenzar");
  await tick(0);
  await click("Entendido, continuar");
}

const ITI_FIRST = 500;
const ITI = 350;
const MARK = 350;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function smallSc() {
  const cfg = validVariantConfig("sc_iat");
  cfg.params = { windowMs: 1500, practiceTrials: 6, testTrials: 12 };
  return cfg;
}

describe("VariantRunner · SC-IAT", () => {
  it("flujo completo: sigue el plan del servidor, marca errores y tiempos agotados, y el servidor puntúa", async () => {
    const config = smallSc();
    const server = createFakeServer(config);
    vi.stubGlobal("fetch", vi.fn(server.fetchImpl));
    render(<VariantRunner token={TOKEN} config={config} preview={false} />);

    expect((screen.getByRole("button", { name: "Comenzar" }) as HTMLButtonElement).disabled).toBe(true);
    await startSession();
    expect(server.state.calls).toEqual(["/check", "/start"]);
    expect(server.state.device).toMatchObject({ inputMode: "keyboard", deviceType: "desktop" });

    const plan = buildPlan(config, SID) as Extract<VariantPlan, { variant: "sc_iat" }>;
    const pairingOf = new Map(plan.blocks.map((b) => [b.id, b.pairing] as const));
    for (const block of plan.blocks as ScBlock[]) {
      await click("Comenzar");
      for (let i = 0; i < block.trials.length; i++) {
        const trial = block.trials[i];
        await tick(i === 0 ? ITI_FIRST : ITI);
        await tick(20);
        expect(screen.getByTestId("stimulus").textContent).toBe(trial.text);
        const wrong = block.id === plan.blocks[0].id && i === 2;
        const slow = block.id === plan.blocks[0].id && i === 4;
        if (slow) {
          await tick(1500); // se agota la ventana
          expect(screen.getByTestId("mark").textContent).toBe("Más rápido");
          await tick(MARK);
          continue;
        }
        const rt = block.practice ? 700 : pairingOf.get(block.id) === "target_positive" ? 600 + (i % 5) * 20 : 800 + (i % 5) * 20;
        await tick(rt);
        pressSide(wrong ? (trial.correctSide === "left" ? "right" : "left") : trial.correctSide);
        if (wrong) {
          expect(screen.getByTestId("mark").textContent).toBe("X");
          await tick(MARK);
        } else if (screen.queryByTestId("mark")) {
          expect(screen.getByTestId("mark").textContent).toBe("");
        }
      }
    }
    await tick(0);

    expect(screen.getByTestId("thanks").textContent).toContain("Gracias");
    expect(document.body.textContent).not.toMatch(/D-score|puntuación|resultado/i);
    expect(server.state.calls).toEqual(["/check", "/start", "/submit"]);
    expect(server.state.status).toBe("completed");
    const row = server.state.result!;
    expect(row.variant).toBe("sc_iat");
    expect((row.trials as unknown[]).length).toBe(36);
    // Más rápido con el polo positivo en la prueba ⇒ D positivo.
    expect(row.primary_value as number).toBeGreaterThan(0.5);
    const trials = row.trials as { practice: boolean; correct: boolean; key: string | null }[];
    expect(trials.filter((t) => !t.correct)).toHaveLength(2);
    expect(trials.filter((t) => t.key === null)).toHaveLength(1);
  });

  it("el pre-chequeo bloquea si ya participó", async () => {
    const config = smallSc();
    vi.stubGlobal("fetch", vi.fn(createFakeServer(config, { checkError: "already_participated" }).fetchImpl));
    render(<VariantRunner token={TOKEN} config={config} preview={false} />);
    await tick(0);
    expect(screen.getByTestId("blocked").textContent).toBe("msg:already_participated");
  });

  it("si /start rechaza (estudio lleno), muestra el mensaje y no avanza", async () => {
    const config = smallSc();
    vi.stubGlobal("fetch", vi.fn(createFakeServer(config, { startError: "full" }).fetchImpl));
    render(<VariantRunner token={TOKEN} config={config} preview={false} />);
    await tick(0);
    act(() => void fireEvent.click(screen.getByRole("checkbox")));
    await click("Comenzar");
    await tick(0);
    expect(screen.getByTestId("blocked").textContent).toBe("msg:full");
  });

  it("vista previa: corre sin llamar jamás al servidor", async () => {
    const config = smallSc();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<VariantRunner token={TOKEN} config={config} preview />);
    expect(screen.getByText(/Vista previa: no se guarda ningún dato/)).toBeTruthy();
    await startSession();
    await click("Comenzar");
    await tick(520);
    expect(screen.getByTestId("stimulus")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("si falla el guardado, ofrece Reintentar y conserva las respuestas", async () => {
    const config = smallSc();
    const server = createFakeServer(config);
    let failures = 5;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/submit") && failures-- > 0) return new Response(JSON.stringify({ ok: false, code: "server_error", message: "msg:server_error" }), { status: 500 });
        return server.fetchImpl(input, init);
      }),
    );
    render(<VariantRunner token={TOKEN} config={config} preview={false} />);
    await startSession();
    const plan = buildPlan(config, SID);
    for (const block of plan.blocks as ScBlock[]) {
      await click("Comenzar");
      for (let i = 0; i < block.trials.length; i++) {
        await tick(i === 0 ? ITI_FIRST : ITI);
        await tick(20);
        await tick(700);
        pressSide(block.trials[i].correctSide);
      }
    }
    await tick(15_000);
    expect(screen.getByText("msg:server_error")).toBeTruthy();
    await click("Reintentar");
    await tick(0);
    expect(screen.getByTestId("thanks")).toBeTruthy();
    expect(server.state.status).toBe("completed");
  });

  it("táctil: muestra el aviso de dispositivo y responde con botones", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {} }));
    Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
    Object.defineProperty(window.screen, "width", { value: 412, configurable: true });
    Object.defineProperty(window.screen, "height", { value: 915, configurable: true });
    const config = smallSc();
    const server = createFakeServer(config);
    vi.stubGlobal("fetch", vi.fn(server.fetchImpl));
    render(<VariantRunner token={TOKEN} config={config} preview={false} />);
    await tick(0);
    act(() => void fireEvent.click(screen.getByRole("checkbox")));
    await click("Comenzar");
    await tick(0);
    await click("Continuar en este dispositivo");
    await click("Entendido, continuar");
    await click("Comenzar");
    await tick(ITI_FIRST + 20);
    const plan = buildPlan(config, SID) as Extract<VariantPlan, { variant: "sc_iat" }>;
    const first = plan.blocks[0].trials[0];
    expect(screen.getByTestId("stimulus").textContent).toBe(first.text);
    await tick(600);
    act(() => void fireEvent.pointerDown(screen.getByTestId(`touch-${first.correctSide}`), { isPrimary: true }));
    await tick(ITI + 20);
    expect(screen.getByTestId("stimulus").textContent).toBe(plan.blocks[0].trials[1].text);
  });
});

describe("VariantRunner · GNAT", () => {
  function smallGnat() {
    const cfg = validVariantConfig("gnat");
    cfg.params = { deadlineMs: 700, trialsPerBlock: 20, practiceTrials: 0 };
    return cfg;
  }

  it("la palabra queda fija hasta el plazo; «go» con espacio, aciertos y omisiones los puntúa el servidor", async () => {
    const config = smallGnat();
    const server = createFakeServer(config);
    vi.stubGlobal("fetch", vi.fn(server.fetchImpl));
    render(<VariantRunner token={TOKEN} config={config} preview={false} />);
    await startSession();

    const plan = buildPlan(config, SID) as Extract<VariantPlan, { variant: "gnat" }>;
    for (const block of plan.blocks as GnatBlock[]) {
      await click("Comenzar");
      expect(screen.getByTestId("go-targets").textContent).toContain(config.concepts[0].label);
      for (let i = 0; i < block.trials.length; i++) {
        const trial = block.trials[i];
        await tick(i === 0 ? ITI_FIRST : ITI);
        await tick(20);
        expect(screen.getByTestId("stimulus").textContent).toBe(trial.text);
        if (trial.signal) {
          await tick(450);
          pressGo();
          // El estímulo sigue en pantalla hasta el plazo.
          expect(screen.queryByTestId("stimulus")).toBeTruthy();
          await tick(700 - 4 - 450);
        } else {
          await tick(700 - 4);
        }
        expect(screen.queryByTestId("mark")?.textContent ?? "").toBe("");
      }
    }
    await tick(0);
    expect(screen.getByTestId("thanks")).toBeTruthy();
    const row = server.state.result!;
    expect(row.variant).toBe("gnat");
    expect(row.valid).toBe(true);
    const scores = row.scores as { detail: { blocks: { counts: { hits: number; falseAlarms: number } }[] } };
    for (const b of scores.detail.blocks) expect(b.counts).toMatchObject({ hits: 10, falseAlarms: 0 });
  });

  it("no responder a una señal muestra «Más rápido» y una falsa alarma muestra la X", async () => {
    const config = smallGnat();
    vi.stubGlobal("fetch", vi.fn(createFakeServer(config).fetchImpl));
    render(<VariantRunner token={TOKEN} config={config} preview={false} />);
    await startSession();
    const block = (buildPlan(config, SID) as Extract<VariantPlan, { variant: "gnat" }>).blocks[0];
    await click("Comenzar");
    const sigIdx = block.trials.findIndex((t) => t.signal);
    const noiseIdx = block.trials.findIndex((t) => !t.signal);
    for (let i = 0; i <= Math.max(sigIdx, noiseIdx); i++) {
      const t = block.trials[i];
      await tick(i === 0 ? ITI_FIRST : ITI);
      await tick(20);
      if (i === sigIdx) {
        await tick(700 - 4);
        expect(screen.getByTestId("mark").textContent).toBe("Más rápido");
        await tick(MARK);
      } else if (i === noiseIdx) {
        await tick(300);
        pressGo();
        await tick(700 - 4 - 300);
        expect(screen.getByTestId("mark").textContent).toBe("X");
        await tick(MARK);
      } else {
        await tick(700 - 4);
        if (t.signal) await tick(MARK);
      }
    }
  });
});

describe("VariantRunner · priming", () => {
  function smallPriming() {
    const cfg = validVariantConfig("priming");
    cfg.params = { primeMs: 200, blankMs: 100, maxResponseMs: 2000, repetitions: 1, practiceTrials: 2 };
    return cfg;
  }

  it("muestra el prime, un blanco y luego la palabra; la práctica da señal y la prueba no", async () => {
    const config = smallPriming();
    const server = createFakeServer(config);
    vi.stubGlobal("fetch", vi.fn(server.fetchImpl));
    render(<VariantRunner token={TOKEN} config={config} preview={false} />);
    await startSession();

    const plan = buildPlan(config, SID) as Extract<VariantPlan, { variant: "priming" }>;
    let sawPrime = false;
    for (const block of plan.blocks as PrimingBlock[]) {
      await click("Comenzar");
      for (let i = 0; i < block.trials.length; i++) {
        const trial = block.trials[i];
        await tick(i === 0 ? ITI_FIRST : ITI);
        expect(screen.getByTestId("prime").textContent).toBe(trial.primeText);
        expect(screen.queryByTestId("stimulus")).toBeNull();
        sawPrime = true;
        await tick(200);
        expect(screen.queryByTestId("prime")).toBeNull();
        expect(screen.queryByTestId("stimulus")).toBeNull(); // blanco entre prime y palabra
        await tick(100);
        await tick(20);
        expect(screen.getByTestId("stimulus").textContent).toBe(trial.text);
        const bias = trial.prime === "c0" ? (trial.targetValence === "positive" ? -40 : 40) : 0;
        await tick(600 + bias);
        const wrongInPractice = block.practice && i === 0;
        pressSide(wrongInPractice ? (trial.correctSide === "left" ? "right" : "left") : trial.correctSide);
        if (wrongInPractice) {
          expect(screen.getByTestId("mark").textContent).toBe("X");
          await tick(MARK);
        }
      }
    }
    await tick(0);
    expect(sawPrime).toBe(true);
    expect(screen.getByTestId("thanks")).toBeTruthy();
    const row = server.state.result!;
    expect(row.variant).toBe("priming");
    expect(row.primary_value as number).toBeGreaterThan(40);
  });
});
