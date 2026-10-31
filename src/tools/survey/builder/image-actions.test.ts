import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  inserted: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
  filters: [] as unknown[][],
  found: { id: "11111111-1111-4111-8111-111111111111" } as {
    id: string;
  } | null,
  insertError: null as unknown,
  verify: vi.fn(),
  remove: vi.fn(),
  deleted: false,
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({
    supabase: {
      from: () => {
        const query = {
          eq: (...args: unknown[]) => {
            mocks.filters.push(args);
            return query;
          },
          select: () => query,
          maybeSingle: async () => ({ data: mocks.found, error: null }),
          single: async () => ({ data: mocks.found, error: mocks.insertError }),
          insert: (row: Record<string, unknown>) => {
            mocks.inserted = row;
            return query;
          },
          update: (row: Record<string, unknown>) => {
            mocks.updated = row;
            return query;
          },
          delete: () => {
            mocks.deleted = true;
            return query;
          },
        };
        return query;
      },
    },
  }),
}));
vi.mock("@/lib/study-files", () => ({ removeStudyFiles: mocks.remove }));
vi.mock("../images.server", () => ({ verifySurveyImages: mocks.verify }));
import {
  discardSurveyImages,
  prepareSurveyImages,
  publishSurveyImages,
} from "./image-actions";
import { buildConfig, TEMPLATES } from "./model";

const studyId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
function input() {
  const built = buildConfig(
    TEMPLATES.find((t) => t.id === "usability")!.build(),
  );
  if (!built.ok) throw new Error("config inválida");
  return { projectId, studyId, name: "Estudio", config: built.config };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserted = null;
  mocks.updated = null;
  mocks.filters = [];
  mocks.found = { id: studyId };
  mocks.insertError = null;
  mocks.deleted = false;
  mocks.verify.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
});
describe("acciones de publicación de imágenes", () => {
  it("reserva un borrador con liga generada en el servidor y respeta un rechazo de RLS", async () => {
    expect(
      await prepareSurveyImages({
        ...input(),
        status: "published",
        tool_type: "iat",
      }),
    ).toEqual({ studyId });
    expect(mocks.inserted).toMatchObject({
      status: "draft",
      tool_type: "survey",
      project_id: projectId,
    });
    expect(mocks.inserted!.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    mocks.insertError = new Error("RLS");
    expect((await prepareSurveyImages(input())).error).toBeTruthy();
  });
  it("rechaza entradas inválidas antes de guardar", async () => {
    expect((await prepareSurveyImages(null)).error).toBeTruthy();
    expect(
      (await publishSurveyImages({ ...input(), studyId: "bad" })).error,
    ).toBeTruthy();
    expect(mocks.inserted).toBeNull();
    expect(mocks.updated).toBeNull();
  });
  it("comprueba proyecto, herramienta y estado del borrador antes de leer archivos", async () => {
    mocks.found = null;
    expect((await publishSurveyImages(input())).error).toMatch(/borrador/);
    expect(mocks.filters).toEqual(
      expect.arrayContaining([
        ["id", studyId],
        ["project_id", projectId],
        ["tool_type", "survey"],
        ["status", "draft"],
      ]),
    );
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.updated).toBeNull();
  });
  it("publica únicamente después de verificar todos los archivos", async () => {
    const data = input();
    expect(await publishSurveyImages(data)).toEqual({ studyId });
    expect(mocks.verify).toHaveBeenCalledWith(
      expect.anything(),
      studyId,
      data.config,
    );
    expect(mocks.updated).toMatchObject({
      name: "Estudio",
      config: data.config,
      status: "published",
    });
  });
  it("mantiene el borrador si la imagen es inválida", async () => {
    mocks.verify.mockResolvedValue("Archivo inválido");
    expect(await publishSurveyImages(input())).toEqual({
      error: "Archivo inválido",
    });
    expect(mocks.updated).toBeNull();
  });
  it("limpia sólo un borrador accesible y nunca un estudio publicado o ajeno", async () => {
    mocks.found = null;
    await discardSurveyImages(studyId);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.deleted).toBe(false);
    mocks.found = { id: studyId };
    await discardSurveyImages(studyId);
    expect(mocks.remove).toHaveBeenCalledWith(expect.anything(), studyId);
    expect(mocks.deleted).toBe(true);
    expect(mocks.filters).toContainEqual(["status", "draft"]);
  });
});
