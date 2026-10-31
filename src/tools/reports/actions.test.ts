import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiError } from "@/lib/ai/types";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  source: vi.fn(),
  generate: vi.fn(),
  revalidate: vi.fn(),
  provider: vi.fn(),
  studyResult: { data: null as unknown, error: null as unknown },
  count: 0 as number | null,
  countError: null as unknown,
  saveError: null as unknown,
  inserted: null as Record<string, unknown> | null,
  filters: [] as unknown[][],
}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("./load", () => ({
  loadReportSource: mocks.source,
  reportHash: () => "a".repeat(64),
}));
vi.mock("@/lib/ai", async () => ({
  AiError: (await import("@/lib/ai/types")).AiError,
  getAnalysisProvider: mocks.provider,
  generateStructured: mocks.generate,
}));
import { generateStudyReport } from "./actions";
import {
  asset,
  briefReport,
  STUDY_ID,
  study,
  surveySource,
} from "./test-fixtures";
import { visualReportSnapshot } from "./model";

function form(id = STUDY_ID) {
  const fd = new FormData();
  fd.set("studyId", id);
  fd.set("aggregates", '{"fake":"CLIENT_PAYLOAD"}');
  return fd;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.studyResult = { data: study, error: null };
  mocks.count = 0;
  mocks.countError = null;
  mocks.saveError = null;
  mocks.inserted = null;
  mocks.filters = [];
  mocks.source.mockResolvedValue(surveySource());
  mocks.generate.mockResolvedValue({ data: briefReport, model: "test-model" });
  mocks.provider.mockReturnValue({ name: "fake-provider" });
  const supabase = {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (...args: unknown[]) => {
          mocks.filters.push(args);
          return query;
        },
        in: (...args: unknown[]) => {
          mocks.filters.push(args);
          return query;
        },
        maybeSingle: async () => mocks.studyResult,
        gte: async () => ({ count: mocks.count, error: mocks.countError }),
        insert: async (row: Record<string, unknown>) => {
          expect(table).toBe("analyses");
          mocks.inserted = row;
          return { error: mocks.saveError };
        },
      };
      return query;
    },
  };
  mocks.requireUser.mockResolvedValue({ supabase });
});

describe("reporte breve con IA", () => {
  it("recalcula en el servidor, envía sólo agregados y persiste el informe con su huella", async () => {
    expect(await generateStudyReport({}, form())).toEqual({ ok: true });
    expect(mocks.filters).toContainEqual(["id", STUDY_ID]);
    expect(mocks.source).toHaveBeenCalledWith(expect.anything(), study);
    const input = mocks.generate.mock.calls[0]![0];
    expect(input.user).not.toMatch(
      /CLIENT_PAYLOAD|PRIVATE_TEXT|private-person|private-session/,
    );
    expect(mocks.inserted).toMatchObject({
      study_id: STUDY_ID,
      n_sessions: 3,
      include_invalid: false,
      provider: "fake-provider",
      model: "test-model",
      result: {
        kind: "study_report",
        sourceKind: "survey",
        sourceHash: "a".repeat(64),
        report: briefReport,
      },
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(
      `/studies/${STUDY_ID}/report`,
    );
  });
  it("rechaza un estudio inaccesible y un id inválido antes de llamar a la IA", async () => {
    expect((await generateStudyReport({}, form("bad-id"))).error).toMatch(
      /inválida/,
    );
    expect(mocks.requireUser).not.toHaveBeenCalled();
    mocks.studyResult = { data: null, error: null };
    expect((await generateStudyReport({}, form())).error).toMatch(/acceso/);
    expect(mocks.source).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("no usa IA con muestras insuficientes", async () => {
    const source = surveySource();
    source.snapshot.aggregates.nIncluded = 2;
    mocks.source.mockResolvedValue(source);
    expect((await generateStudyReport({}, form())).error).toMatch(/al menos 3/);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("frena el gasto si se alcanzó el límite o no puede comprobarse", async () => {
    mocks.count = 10;
    expect((await generateStudyReport({}, form())).error).toMatch(/límite/);
    mocks.count = null;
    expect((await generateStudyReport({}, form())).error).toMatch(/comprobar/);
    mocks.count = 0;
    mocks.countError = new Error("RLS");
    expect((await generateStudyReport({}, form())).error).toMatch(/comprobar/);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("no inventa participantes para un estudio de imágenes con IA", async () => {
    mocks.source.mockResolvedValue({
      kind: "visual",
      snapshot: visualReportSnapshot("Piezas", "Objetivo", [asset()]),
    });
    expect(await generateStudyReport({}, form())).toEqual({ ok: true });
    expect(mocks.inserted?.n_sessions).toBe(0);
    expect(mocks.inserted?.result).toMatchObject({ sourceKind: "visual" });
  });
  it("no guarda un análisis si la fuente falla y permite reintentar errores del proveedor", async () => {
    mocks.source.mockRejectedValueOnce(new Error("database"));
    expect((await generateStudyReport({}, form())).error).toMatch(
      /resultados siguen disponibles/,
    );
    expect(mocks.generate).not.toHaveBeenCalled();
    mocks.generate.mockRejectedValue(
      new AiError("Proveedor no disponible", "provider"),
    );
    expect(await generateStudyReport({}, form())).toEqual({
      error: "Proveedor no disponible",
    });
    expect(mocks.inserted).toBeNull();
  });
  it("informa cuando se generó el reporte pero la base rechazó guardarlo", async () => {
    mocks.saveError = new Error("RLS");
    expect((await generateStudyReport({}, form())).error).toMatch(
      /no pudo guardarse/,
    );
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
