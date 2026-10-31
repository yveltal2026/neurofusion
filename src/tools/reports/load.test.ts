import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  records: vi.fn(),
  assets: vi.fn(),
  eye: vi.fn(),
}));
vi.mock("@/tools/survey/results/load", () => ({
  loadSurveyRecords: mocks.records,
}));
vi.mock("@/tools/visual/results", () => ({ loadAssets: mocks.assets }));
vi.mock("@/tools/eyetracking/results/load", async (original) => ({
  ...(await original<typeof import("@/tools/eyetracking/results/load")>()),
  loadEyeReportRecords: mocks.eye,
}));
import { loadReportSource, loadSavedReport } from "./load";
import {
  asset,
  briefReport,
  eyeRecords,
  study,
  STUDY_ID,
  surveyRecords,
} from "./test-fixtures";
import { REPORT_VERSION } from "./schema";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.mockResolvedValue(surveyRecords());
  mocks.assets.mockResolvedValue([asset()]);
  mocks.eye.mockResolvedValue(eyeRecords());
});

describe("fuente del informe", () => {
  const client = {} as SupabaseClient;
  it("elige agregados de encuesta con las respuestas autoritativas del estudio", async () => {
    const source = await loadReportSource(client, study);
    expect(source.kind).toBe("survey");
    expect(mocks.records).toHaveBeenCalledWith(client, STUDY_ID);
    expect(mocks.assets).not.toHaveBeenCalled();
  });
  it("separa eye tracking de las estimaciones visuales aunque compartan tool_type", async () => {
    const visual = {
      ...study,
      tool_type: "visual" as const,
      config: {
        mode: "pieces",
        objective: "Objetivo",
        brand: "",
        audience: "",
      },
    };
    expect((await loadReportSource(client, visual)).kind).toBe("visual");
    expect(mocks.eye).not.toHaveBeenCalled();
    expect(
      (
        await loadReportSource(client, {
          ...visual,
          config: { ...visual.config, eyeTracking: { durationSeconds: 5 } },
        })
      ).kind,
    ).toBe("eye");
    expect(mocks.eye).toHaveBeenCalledWith(client, STUDY_ID);
  });
  it("no continúa si falla la carga de datos", async () => {
    mocks.records.mockRejectedValue(new Error("database"));
    await expect(loadReportSource(client, study)).rejects.toThrow("database");
  });
});

describe("reporte guardado", () => {
  function client(data: unknown, error: unknown = null) {
    const filters: unknown[][] = [];
    const query = {
      select: () => query,
      eq: (...args: unknown[]) => {
        filters.push(args);
        return query;
      },
      contains: (...args: unknown[]) => {
        filters.push(args);
        return query;
      },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data, error }),
    };
    return {
      filters,
      supabase: { from: () => query } as unknown as SupabaseClient,
    };
  }
  it("recupera el reporte por estudio y tipo sin mezclar análisis IAT o de otras herramientas", async () => {
    const result = {
      kind: "study_report",
      version: REPORT_VERSION,
      sourceKind: "survey",
      sourceHash: "a".repeat(64),
      report: briefReport,
    };
    const c = client({
      id: "saved",
      created_at: "2026-10-31T00:00:00Z",
      provider: "fake",
      model: "test",
      result,
    });
    expect(
      (await loadSavedReport(c.supabase, STUDY_ID, "survey")).report?.result
        .report,
    ).toEqual(briefReport);
    expect(c.filters).toContainEqual(["study_id", STUDY_ID]);
    expect(c.filters).toContainEqual([
      "result",
      { kind: "study_report", version: REPORT_VERSION, sourceKind: "survey" },
    ]);
  });
  it("distingue un reporte inexistente de un fallo de carga o formato", async () => {
    expect(
      await loadSavedReport(client(null).supabase, STUDY_ID, "eye"),
    ).toEqual({ report: null });
    expect(
      (
        await loadSavedReport(
          client(null, new Error("RLS")).supabase,
          STUDY_ID,
          "eye",
        )
      ).error,
    ).toMatch(/visualizaciones siguen/);
    expect(
      (await loadSavedReport(client({ result: {} }).supabase, STUDY_ID, "eye"))
        .error,
    ).toMatch(/formato/);
  });
});
