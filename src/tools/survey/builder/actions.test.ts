import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inserted: null as Record<string, unknown> | null,
  insertResult: {
    data: { id: "study-123" } as { id: string } | null,
    error: null as unknown,
  },
  redirected: null as string | null,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mocks.redirected = url;
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({
    supabase: {
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          mocks.inserted = row;
          return { select: () => ({ single: async () => mocks.insertResult }) };
        },
      }),
    },
  }),
}));

import { buildConfig, TEMPLATES } from "./model";
import { createSurveyStudy } from "./actions";

const PROJECT = "11111111-1111-4111-8111-111111111111";

function validConfig() {
  const built = buildConfig(
    TEMPLATES.find((t) => t.id === "usability")!.build(),
  );
  if (!built.ok) throw new Error("plantilla inválida");
  return built.config;
}

beforeEach(() => {
  mocks.inserted = null;
  mocks.redirected = null;
  mocks.insertResult = { data: { id: "study-123" }, error: null };
});

describe("createSurveyStudy", () => {
  it("crea la encuesta publicada con liga mágica y redirige a su resumen", async () => {
    await expect(
      createSurveyStudy({
        projectId: PROJECT,
        name: "  Mi estudio  ",
        config: validConfig(),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirected).toBe("/studies/study-123?created=1");
    expect(mocks.inserted).toMatchObject({
      project_id: PROJECT,
      tool_type: "survey",
      name: "Mi estudio",
      status: "published",
    });
    expect(mocks.inserted!.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      (mocks.inserted!.config as { blocks: unknown[] }).blocks.length,
    ).toBeGreaterThan(0);
  });

  it("rechaza configuraciones inválidas sin tocar la base de datos", async () => {
    const config = { ...validConfig(), blocks: [] };
    expect(
      await createSurveyStudy({ projectId: PROJECT, name: "x", config }),
    ).toEqual({ error: expect.stringContaining("al menos un bloque") });
    expect(mocks.inserted).toBeNull();
  });

  it("rechaza un nombre vacío, un proyecto que no es uuid y entradas basura", async () => {
    expect(
      await createSurveyStudy({
        projectId: PROJECT,
        name: "   ",
        config: validConfig(),
      }),
    ).toEqual({ error: "Escribe un nombre para el estudio" });
    expect(
      (
        await createSurveyStudy({
          projectId: "no-es-uuid",
          name: "x",
          config: validConfig(),
        })
      ).error,
    ).toBeTruthy();
    expect((await createSurveyStudy(null)).error).toBeTruthy();
    expect((await createSurveyStudy("hola")).error).toBeTruthy();
    expect(mocks.inserted).toBeNull();
  });

  it("no acepta que el cliente fije campos del servidor (estado, token, herramienta)", async () => {
    await expect(
      createSurveyStudy({
        projectId: PROJECT,
        name: "x",
        config: validConfig(),
        status: "closed",
        access_token: "robado",
        tool_type: "iat",
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.inserted).toMatchObject({
      tool_type: "survey",
      status: "published",
    });
    expect(mocks.inserted!.access_token).not.toBe("robado");
  });

  it("si la base rechaza el alta (RLS / proyecto ajeno) devuelve un error y no redirige", async () => {
    mocks.insertResult = { data: null, error: { message: "rls" } };
    expect(
      await createSurveyStudy({
        projectId: PROJECT,
        name: "x",
        config: validConfig(),
      }),
    ).toEqual({
      error: expect.stringContaining("No se pudo crear la encuesta"),
    });
    expect(mocks.redirected).toBeNull();
  });
});
