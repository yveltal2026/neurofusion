import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { createCascadeProvider, type Tier } from "./cascade";
import { createGeminiProvider, toGeminiContents } from "./gemini";
import { getAnalysisProvider, isAiConfigured } from "./index";
import { generateStructured } from "./structured";
import { resolveTiers } from "./tiers";
import { AiError, type AnalysisProvider, type CompletionRequest } from "./types";

const REQ: CompletionRequest = { system: "s", messages: [{ role: "user", content: "hola" }] };

function tier(id: string, behaviour: string | AiError | ((req: CompletionRequest) => Promise<string>), calls: string[] = []): Tier {
  const provider: AnalysisProvider = {
    name: id.startsWith("g") ? "gemini" : "anthropic",
    model: `${id}-model`,
    async complete(req) {
      calls.push(id);
      if (typeof behaviour === "function") return { text: await behaviour(req), model: `${id}-model` };
      if (behaviour instanceof AiError) throw behaviour;
      return { text: behaviour, model: `${id}-model` };
    },
  };
  return { id, label: id, provider };
}

const quiet = { log: () => {}, cooldowns: new Map<string, number>() };
const fresh = () => ({ ...quiet, cooldowns: new Map<string, number>() });

describe("createCascadeProvider", () => {
  it("usa el primer nivel si responde y no toca los demás", async () => {
    const calls: string[] = [];
    const p = createCascadeProvider([tier("free-pro", "ok", calls), tier("claude", "otro", calls)], fresh());
    expect((await p.complete(REQ)).text).toBe("ok");
    expect(calls).toEqual(["free-pro"]);
    expect(p.model).toBe("free-pro-model");
  });

  it("recorre gratuita → gratuita → paga barata → paga cara → Claude, en ese orden", async () => {
    const calls: string[] = [];
    const quota = () => new AiError("sin cuota", "rate_limit");
    const p = createCascadeProvider(
      [tier("g-free-pro", quota(), calls), tier("g-free-flash", quota(), calls), tier("g-paid-flash", quota(), calls), tier("g-paid-pro", quota(), calls), tier("claude", "listo", calls)],
      fresh(),
    );
    const r = await p.complete(REQ);
    expect(calls).toEqual(["g-free-pro", "g-free-flash", "g-paid-flash", "g-paid-pro", "claude"]);
    expect(r).toEqual({ text: "listo", model: "claude-model" });
    // name y model reflejan el nivel que respondió, para guardarlos con el análisis
    expect(p.name).toBe("anthropic");
    expect(p.model).toBe("claude-model");
  });

  it.each(["auth", "rate_limit", "provider", "truncated", "refusal"] as const)("salta al siguiente nivel ante «%s»", async (kind) => {
    const calls: string[] = [];
    const p = createCascadeProvider([tier("a", new AiError("x", kind), calls), tier("b", "ok", calls)], fresh());
    expect((await p.complete(REQ)).text).toBe("ok");
    expect(calls).toEqual(["a", "b"]);
  });

  it("un fallo inesperado (no AiError) también pasa al siguiente nivel", async () => {
    const calls: string[] = [];
    const boom = tier("a", async () => {
      throw new TypeError("fetch failed");
    }, calls);
    const p = createCascadeProvider([boom, tier("b", "ok", calls)], fresh());
    expect((await p.complete(REQ)).text).toBe("ok");
  });

  it("un error de configuración se propaga sin probar los demás", async () => {
    const calls: string[] = [];
    const p = createCascadeProvider([tier("a", new AiError("mal config", "config"), calls), tier("b", "ok", calls)], fresh());
    await expect(p.complete(REQ)).rejects.toMatchObject({ kind: "config" });
    expect(calls).toEqual(["a"]);
  });

  it("si todos fallan, lanza el último error e indica cuántos se intentaron", async () => {
    const p = createCascadeProvider([tier("a", new AiError("uno", "provider")), tier("b", new AiError("dos", "auth"))], fresh());
    await expect(p.complete(REQ)).rejects.toMatchObject({ kind: "auth", message: expect.stringContaining("2 proveedores") });
  });

  it("si todos agotaron la cuota, el error es rate_limit", async () => {
    const p = createCascadeProvider([tier("a", new AiError("q", "rate_limit")), tier("b", new AiError("q", "rate_limit"))], fresh());
    await expect(p.complete(REQ)).rejects.toMatchObject({ kind: "rate_limit" });
  });

  it("con un solo nivel conserva el mensaje original del proveedor", async () => {
    const p = createCascadeProvider([tier("a", new AiError("La API key no es válida.", "auth"))], fresh());
    await expect(p.complete(REQ)).rejects.toMatchObject({ message: "La API key no es válida." });
  });

  it("pausa un nivel sin cuota y lo reintenta cuando pasa el tiempo", async () => {
    let t = 1_000;
    const calls: string[] = [];
    const opts = { ...fresh(), now: () => t };
    const p = createCascadeProvider([tier("free", new AiError("q", "rate_limit"), calls), tier("paid", "ok", calls)], opts);
    await p.complete(REQ);
    await p.complete(REQ); // segundo pedido: el nivel gratuito está en pausa
    expect(calls).toEqual(["free", "paid", "paid"]);
    t += 61_000;
    await p.complete(REQ); // la pausa terminó
    expect(calls).toEqual(["free", "paid", "paid", "free", "paid"]);
  });

  it("no pausa por errores transitorios", async () => {
    const calls: string[] = [];
    const p = createCascadeProvider([tier("a", new AiError("x", "provider"), calls), tier("b", "ok", calls)], fresh());
    await p.complete(REQ);
    await p.complete(REQ);
    expect(calls).toEqual(["a", "b", "a", "b"]);
  });

  it("si todos los niveles están en pausa, los intenta de todos modos", async () => {
    const cooldowns = new Map([["a", Date.now() + 60_000], ["b", Date.now() + 60_000]]);
    const calls: string[] = [];
    const p = createCascadeProvider([tier("a", "ok", calls), tier("b", "ok", calls)], { log: () => {}, cooldowns });
    expect((await p.complete(REQ)).text).toBe("ok");
    expect(calls).toEqual(["a"]);
  });

  it("corta un nivel que se queda colgado y pasa al siguiente", async () => {
    const hang = (req: CompletionRequest) =>
      new Promise<string>((_, reject) => {
        req.signal?.addEventListener("abort", () => reject(new AiError("tardó demasiado", "provider")));
      });
    const p = createCascadeProvider([tier("lento", hang), tier("rapido", "ok")], { ...fresh(), perTierTimeoutMs: 30 });
    expect((await p.complete(REQ)).text).toBe("ok");
  });

  it("respeta la señal de cancelación del llamador", async () => {
    let seen: AbortSignal | undefined;
    const p = createCascadeProvider(
      [tier("a", async (req) => {
        seen = req.signal;
        return "ok";
      })],
      fresh(),
    );
    const ctl = new AbortController();
    await p.complete({ ...REQ, signal: ctl.signal });
    ctl.abort();
    expect(seen?.aborted).toBe(true);
  });

  it("exige al menos un nivel", () => {
    expect(() => createCascadeProvider([])).toThrow(/ningún proveedor|No hay/i);
  });

  it("funciona con generateStructured: el reintento de formato vuelve a pasar por la cascada", async () => {
    const calls: string[] = [];
    let n = 0;
    const flaky = tier("a", async () => (++n === 1 ? "no es json" : '{"a":1}'), calls);
    const p = createCascadeProvider([flaky], fresh());
    const r = await generateStructured({ provider: p, system: "s", user: "u", schema: z.object({ a: z.number() }) });
    expect(r.data.a).toBe(1);
    expect(r.attempts).toBe(2);
  });
});

describe("Gemini", () => {
  const img = { type: "image" as const, mediaType: "image/png" as const, data: "AAAA" };

  function mockFetch(status: number, body: unknown) {
    return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  }
  const ok = (text: string, extra: object = {}) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP", ...extra }], modelVersion: "gemini-x-001" });
  const make = (fetchImpl: typeof fetch, tier: "free" | "paid" = "free") => createGeminiProvider({ apiKey: "KEY", model: "gemini-x", tier, fetchImpl });

  it("traduce roles e imágenes", () => {
    expect(
      toGeminiContents([
        { role: "user", content: [img, { type: "text", text: "mira" }] },
        { role: "assistant", content: [{ type: "text", text: "ok" }, img] },
        { role: "user", content: "sigue" },
      ]),
    ).toEqual([
      { role: "user", parts: [{ inlineData: { mimeType: "image/png", data: "AAAA" } }, { text: "mira" }] },
      { role: "model", parts: [{ text: "ok" }] },
      { role: "user", parts: [{ text: "sigue" }] },
    ]);
  });

  it("envía modelo, clave en cabecera (no en la URL), sistema y JSON", async () => {
    const f = mockFetch(200, ok('{"a":1}'));
    const r = await make(f).complete(REQ);
    expect(r).toEqual({ text: '{"a":1}', model: "gemini-x-001" });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent");
    expect(String(url)).not.toContain("KEY");
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY");
    const body = JSON.parse(String(init?.body));
    expect(body.systemInstruction.parts[0].text).toBe("s");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("ignora las partes de razonamiento (thought)", async () => {
    const f = mockFetch(200, { candidates: [{ content: { parts: [{ text: "pensando", thought: true }, { text: '{"a":2}' }] }, finishReason: "STOP" }] });
    expect((await make(f).complete(REQ)).text).toBe('{"a":2}');
  });

  it.each([
    [429, { error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }, "rate_limit"],
    [403, { error: { status: "PERMISSION_DENIED", message: "no" } }, "auth"],
    [401, {}, "auth"],
    [400, { error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } }, "auth"],
    [404, { error: { status: "NOT_FOUND", message: "model" } }, "provider"],
    [500, { error: { status: "INTERNAL" } }, "provider"],
    [503, { error: { status: "UNAVAILABLE" } }, "provider"],
  ] as const)("HTTP %i → %s", async (status, body, kind) => {
    const f = mockFetch(status, body);
    await expect(make(f).complete(REQ)).rejects.toMatchObject({ name: "AiError", kind });
  });

  it("MAX_TOKENS → truncated; SAFETY y blockReason → refusal; vacía → provider", async () => {
    const run = (body: unknown) => make(mockFetch(200, body)).complete(REQ);
    await expect(run(ok("{", { finishReason: "MAX_TOKENS" }))).rejects.toMatchObject({ kind: "truncated" });
    await expect(run(ok("", { finishReason: "SAFETY" }))).rejects.toMatchObject({ kind: "refusal" });
    await expect(run({ promptFeedback: { blockReason: "OTHER" } })).rejects.toMatchObject({ kind: "refusal" });
    await expect(run({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }] })).rejects.toMatchObject({ kind: "provider" });
  });

  it("fallos de red y tiempo de espera → provider, sin filtrar la clave", async () => {
    const net = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed for KEY");
    });
    const err = await make(net).complete(REQ).catch((e) => e);
    expect(err).toMatchObject({ kind: "provider" });
    expect(String(err.message)).not.toContain("KEY");

    const abort = vi.fn<typeof fetch>(async () => {
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    });
    await expect(make(abort).complete(REQ)).rejects.toMatchObject({ kind: "provider", message: expect.stringContaining("tardó") });
  });

  it("los mensajes de error distinguen gratuito y de paga", async () => {
    const f = mockFetch(429, { error: { status: "RESOURCE_EXHAUSTED" } });
    await expect(make(f, "paid").complete(REQ)).rejects.toMatchObject({ message: expect.stringContaining("de paga") });
    await expect(make(f, "free").complete(REQ)).rejects.toMatchObject({ message: expect.stringContaining("gratuito") });
  });
});

describe("configuración de la cascada", () => {
  const ids = (env: Record<string, string>, cascade?: string) => resolveTiers(env, cascade).map((t) => t.id);
  const ALL = { GEMINI_API_KEY_FREE: "f", GEMINI_API_KEY_PAID: "p", ANTHROPIC_API_KEY: "a" };

  it("por defecto: gratuita potente → gratuita menos potente → paga barata → paga cara → Claude", () => {
    expect(ids(ALL)).toEqual([
      "gemini-free:gemini-3.8-flash",
      "gemini-free:gemini-3.5-flash-lite",
      "gemini-paid:gemini-3.8-flash",
      "gemini-paid:gemini-4-argon",
      "anthropic:default",
    ]);
  });

  it("omite los niveles sin API key", () => {
    expect(ids({ GEMINI_API_KEY_FREE: "f" })).toEqual(["gemini-free:gemini-3.8-flash", "gemini-free:gemini-3.5-flash-lite"]);
    expect(ids({ GEMINI_API_KEY_PAID: "p", ANTHROPIC_API_KEY: "a" })).toEqual(["gemini-paid:gemini-3.8-flash", "gemini-paid:gemini-4-argon", "anthropic:default"]);
  });

  it("GEMINI_API_KEY es alias de la gratuita", () => {
    expect(ids({ GEMINI_API_KEY: "f" })).toHaveLength(2);
  });

  it("AI_CASCADE reemplaza el orden y los modelos; Claude toma ANTHROPIC_MODEL", () => {
    const env = { ...ALL, ANTHROPIC_MODEL: "claude-sonnet-5-5" };
    expect(ids(env, "gemini-free:m1, gemini-paid:m2 ,anthropic")).toEqual(["gemini-free:m1", "gemini-paid:m2", "anthropic:claude-sonnet-5-5"]);
    expect(ids(ALL, "anthropic:claude-opus-5-5,gemini-free:m1")).toEqual(["anthropic:claude-opus-5-5", "gemini-free:m1"]);
  });

  it("ignora niveles repetidos", () => {
    expect(ids(ALL, "gemini-free:m1,gemini-free:m1")).toEqual(["gemini-free:m1"]);
  });

  it("errores claros de configuración", () => {
    expect(() => resolveTiers(ALL, "gemini-free")).toThrow(/necesita un modelo/);
    expect(() => resolveTiers(ALL, "otro:x")).toThrow(/desconocido/);
    expect(() => resolveTiers({ OPENAI_API_KEY: "k" }, "openai")).toThrow(/modelo/);
  });

  it("getAnalysisProvider: con claves de Gemini usa la cascada y refleja el primer nivel", () => {
    expect(getAnalysisProvider(ALL)).toMatchObject({ name: "gemini", model: "gemini-3.8-flash" });
  });

  it("getAnalysisProvider: sin claves de Gemini ni AI_CASCADE conserva el comportamiento anterior", () => {
    expect(getAnalysisProvider({ ANTHROPIC_API_KEY: "k" })).toMatchObject({ name: "anthropic", model: "claude-opus-5-5" });
    expect(() => getAnalysisProvider({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("AI_CASCADE sin ninguna clave disponible da un error de configuración claro", () => {
    expect(() => getAnalysisProvider({ AI_CASCADE: "gemini-free:m1" })).toThrow(/GEMINI_API_KEY_FREE/);
  });

  it("isAiConfigured", () => {
    expect(isAiConfigured({ GEMINI_API_KEY_FREE: "f" })).toBe(true);
    expect(isAiConfigured({})).toBe(false);
  });
});
