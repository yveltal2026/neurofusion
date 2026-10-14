// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THANK_YOU, defaultConsentText, type SurveyConfig } from "../engine";
import { SurveyRunner } from "./SurveyRunner";

vi.mock("@/tools/iat/runner/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/tools/iat/runner/api")>();
  return { ...actual, withRetry: ((fn, o) => actual.withRetry(fn, { ...o, baseDelayMs: 0 })) as typeof actual.withRetry };
});

const TOKEN = "t".repeat(43);
const BATTERY_SESSION = "11111111-1111-4111-8111-111111111111";

const config: SurveyConfig = {
  version: 1,
  title: "Encuesta de la batería",
  intro: "Una introducción que no debe mostrarse.",
  texts: { consent: defaultConsentText("Encuesta de la batería"), thankYou: DEFAULT_THANK_YOU },
  blocks: [
    {
      kind: "questions",
      id: "perfil",
      questions: [{ type: "select", id: "frecuencia", prompt: "¿Con qué frecuencia compras?", required: true, options: ["Semanal", "Mensual"] }],
    },
  ],
};

function fakeFetch(opts: { startCode?: string } = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, body });
    if (url.endsWith("/survey/start")) {
      if (opts.startCode) return new Response(JSON.stringify({ ok: false, code: opts.startCode, message: `error:${opts.startCode}` }), { status: 409 });
      return new Response(JSON.stringify({ ok: true, sessionId: "child-1" }), { status: 200 });
    }
    if (url.endsWith("/survey/submit")) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response(JSON.stringify({ ok: false, code: "not_found", message: "?" }), { status: 404 });
  };
  return { calls, impl };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SurveyRunner incrustado en una batería", () => {
  it("arranca sola, sin bienvenida ni consentimiento, enlazando la sesión de batería", async () => {
    const f = fakeFetch();
    vi.stubGlobal("fetch", f.impl);
    render(<SurveyRunner token={TOKEN} config={config} preview={false} embedded={{ batterySessionId: BATTERY_SESSION, onComplete: () => {} }} />);

    expect(await screen.findByRole("group", { name: /con qué frecuencia compras/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Comenzar" })).toBeNull();
    expect(screen.queryByText(/Una introducción que no debe mostrarse/)).toBeNull();
    const start = f.calls.filter((c) => c.url.endsWith("/survey/start"));
    expect(start).toHaveLength(1);
    expect(start[0]!.body).toMatchObject({ consent: true, batterySessionId: BATTERY_SESSION });
    // No hace el pre-chequeo de la liga individual.
    expect(f.calls.some((c) => c.url.endsWith("/survey/check"))).toBe(false);
  });

  it("al enviar avisa a la batería una sola vez y no muestra la pantalla final", async () => {
    const f = fakeFetch();
    vi.stubGlobal("fetch", f.impl);
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<SurveyRunner token={TOKEN} config={config} preview={false} embedded={{ batterySessionId: BATTERY_SESSION, onComplete }} />);

    const group = await screen.findByRole("group", { name: /con qué frecuencia compras/i });
    await user.click(within(group).getByRole("radio", { name: "Semanal" }));
    await user.click(screen.getByRole("button", { name: "Enviar respuestas" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("thanks")).toBeNull();
    expect(screen.getByTestId("embedded-done")).toBeTruthy();
    expect(f.calls.filter((c) => c.url.endsWith("/survey/submit"))).toHaveLength(1);
  });

  it("si el servidor rechaza el paso, muestra el motivo y no avisa a la batería", async () => {
    const f = fakeFetch({ startCode: "already_participated" });
    vi.stubGlobal("fetch", f.impl);
    const onComplete = vi.fn();
    render(<SurveyRunner token={TOKEN} config={config} preview={false} embedded={{ batterySessionId: BATTERY_SESSION, onComplete }} />);
    expect(await screen.findByText("error:already_participated")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("sin modo incrustado conserva la bienvenida y no envía batterySessionId", async () => {
    const f = fakeFetch();
    vi.stubGlobal("fetch", f.impl);
    render(<SurveyRunner token={TOKEN} config={config} preview={false} />);
    expect(await screen.findByRole("button", { name: "Comenzar" })).toBeTruthy();
    expect(f.calls.some((c) => c.url.endsWith("/survey/start"))).toBe(false);
  });
});
