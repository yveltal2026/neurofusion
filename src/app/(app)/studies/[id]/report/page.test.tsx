import { beforeEach, describe, expect, it, vi } from "vitest";
import { asset, eyeRecords, study, surveySource } from "@/tools/reports/test-fixtures";
import { eyeReportSnapshot, visualReportSnapshot } from "@/tools/reports/model";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ candidate: null as unknown, source: vi.fn(), visual: vi.fn(), assets: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ supabase: { from: (table: string) => {
  const query = { select: () => query, eq: () => query, in: () => query, order: () => query,
    maybeSingle: async () => ({ data: table === "studies" ? mocks.candidate : { name: "Proyecto" } }),
    returns: async () => ({ data: [] }),
  }; return query;
} } }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/tools/visual/load", () => ({ loadVisualStudyPage: mocks.visual }));
vi.mock("@/tools/visual/results", () => ({ loadAssets: mocks.assets, assetUrls: async () => ({}) }));
vi.mock("@/tools/reports/load", () => ({ loadReportSource: mocks.source, loadSavedReport: async () => ({ report: null }), reportHash: () => "a".repeat(64) }));
vi.mock("@/tools/reports/actions", () => ({ generateStudyReport: vi.fn() }));
import ReportPage from "./page";
import { StudyReportView } from "@/tools/reports/ui/StudyReportView";

const pieces = { mode: "pieces" as const, objective: "Objetivo", brand: "", audience: "" };
const props = { params: Promise.resolve({ id: study.id }) } as Parameters<typeof ReportPage>[0];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.candidate = study;
  mocks.source.mockResolvedValue(surveySource());
  mocks.assets.mockResolvedValue([]);
  mocks.visual.mockResolvedValue({ study: { ...study, tool_type: "visual" }, config: pieces, projectName: "Proyecto" });
});

describe("ruta de informes", () => {
  it("abre el informe de encuesta en lugar de intentar cargar un estudio visual", async () => {
    const page = await ReportPage(props);
    expect(page.type).toBe(StudyReportView);
    expect(page.props.source.kind).toBe("survey");
    expect(mocks.visual).not.toHaveBeenCalled();
  });
  it("habilita el informe de eye tracking y mantiene su origen medido separado", async () => {
    const config = { ...pieces, eyeTracking: { durationSeconds: 5 } };
    mocks.candidate = { ...study, tool_type: "visual", config };
    mocks.visual.mockResolvedValue({ study: mocks.candidate, config, projectName: "Proyecto" });
    mocks.source.mockResolvedValue({ kind: "eye", config, assets: [asset()], snapshot: eyeReportSnapshot("Miradas", "Objetivo", [asset()], eyeRecords()) });
    const page = await ReportPage(props);
    expect(page.type).toBe(StudyReportView);
    expect(page.props.source.kind).toBe("eye");
    expect(mocks.visual).toHaveBeenCalledWith(expect.anything(), study.id, undefined, true);
  });
  it("conserva el informe detallado de piezas visuales y el informe de recorridos", async () => {
    mocks.candidate = { ...study, tool_type: "visual", config: pieces };
    const visual = await ReportPage(props);
    expect(visual.type).toBe("div");
    const config = { mode: "journey", objective: "Objetivo", sites: [], tasks: [], panel: { seed: 1 } };
    mocks.visual.mockResolvedValue({ study: mocks.candidate, config, projectName: "Proyecto" });
    const journey = await ReportPage(props);
    expect(journey.type).toBe("div");
    expect(visualReportSnapshot("Visual", "Objetivo", []).analyzed).toBe(0);
  });
  it("no expone informes cuando RLS no devuelve el estudio", async () => {
    mocks.candidate = null;
    await expect(ReportPage(props)).rejects.toThrow("NOT_FOUND");
    expect(mocks.source).not.toHaveBeenCalled();
  });
});
