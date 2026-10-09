import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { getAnalysisProvider } from "./index";
import { extractJson, generateStructured } from "./structured";
import { AiError, type AnalysisProvider, type CompletionRequest } from "./types";

const schema = z.object({ a: z.number(), b: z.string() });

function fakeProvider(replies: string[]): AnalysisProvider & { calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  return {
    name: "anthropic",
    model: "fake",
    calls,
    async complete(req) {
      calls.push(structuredClone(req));
      return { text: replies[calls.length - 1] ?? "", model: "fake-model" };
    },
  };
}

describe("extractJson", () => {
  it("acepta JSON limpio, con cercas y con texto alrededor", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Claro, aquí está:\n{"a":1,"b":"x"}\nSaludos')).toEqual({ a: 1, b: "x" });
  });
  it("falla si no hay JSON", () => {
    expect(() => extractJson("sin json")).toThrow();
  });
});

describe("generateStructured", () => {
  it("devuelve datos validados a la primera", async () => {
    const p = fakeProvider(['{"a":1,"b":"ok"}']);
    const r = await generateStructured({ provider: p, system: "s", user: "u", schema });
    expect(r).toEqual({ data: { a: 1, b: "ok" }, model: "fake-model", attempts: 1 });
    expect(p.calls).toHaveLength(1);
  });

  it("reintenta una vez diciéndole al modelo qué falló", async () => {
    const p = fakeProvider(['{"a":"no-es-numero","b":"x"}', '{"a":2,"b":"x"}']);
    const r = await generateStructured({ provider: p, system: "s", user: "u", schema });
    expect(r.data).toEqual({ a: 2, b: "x" });
    expect(r.attempts).toBe(2);
    const retry = p.calls[1].messages;
    expect(retry.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(retry[2].content).toContain("a:");
  });

  it("también reintenta si la respuesta no es JSON", async () => {
    const p = fakeProvider(["lo siento", '{"a":3,"b":"y"}']);
    expect((await generateStructured({ provider: p, system: "s", user: "u", schema })).data.a).toBe(3);
  });

  it("lanza AiError(invalid_output) tras dos fallos", async () => {
    const p = fakeProvider(["nada", "tampoco"]);
    await expect(generateStructured({ provider: p, system: "s", user: "u", schema })).rejects.toMatchObject({
      name: "AiError",
      kind: "invalid_output",
    });
    expect(p.calls).toHaveLength(2);
  });

  it("propaga los errores del proveedor sin reintentar", async () => {
    const p: AnalysisProvider = {
      name: "openai",
      model: "x",
      complete: async () => {
        throw new AiError("rate", "rate_limit");
      },
    };
    await expect(generateStructured({ provider: p, system: "s", user: "u", schema })).rejects.toMatchObject({ kind: "rate_limit" });
  });
});

describe("getAnalysisProvider", () => {
  it("anthropic por defecto, con modelo por defecto o configurado", () => {
    expect(getAnalysisProvider({ ANTHROPIC_API_KEY: "k" })).toMatchObject({ name: "anthropic", model: "claude-opus-5-5" });
    expect(getAnalysisProvider({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-sonnet-5-5" }).model).toBe("claude-sonnet-5-5");
  });
  it("openai exige key y modelo", () => {
    expect(getAnalysisProvider({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k", OPENAI_MODEL: "m" })).toMatchObject({ name: "openai", model: "m" });
    expect(() => getAnalysisProvider({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k" })).toThrow(/OPENAI_MODEL/);
    expect(() => getAnalysisProvider({ AI_PROVIDER: "openai", OPENAI_MODEL: "m" })).toThrow(/OPENAI_API_KEY/);
  });
  it("errores claros de configuración", () => {
    expect(() => getAnalysisProvider({})).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => getAnalysisProvider({ AI_PROVIDER: "otro" })).toThrow(/inválido/);
  });
});
