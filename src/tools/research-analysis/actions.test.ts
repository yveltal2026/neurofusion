import { beforeEach, describe, expect, it, vi } from "vitest";
import { runResearchAnalysis } from "./actions";
import { resetRateLimits } from "@/lib/rate-limit";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  study: vi.fn(),
  battery: vi.fn(),
  generate: vi.fn(),
  insert: vi.fn(),
  revalidate: vi.fn(),
  count: 0,
  countError: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("./load", () => ({
  loadStudyAnalysis: mocks.study,
  loadBatteryAnalysis: mocks.battery,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/ai", () => ({
  AiError: class extends Error {},
  getAnalysisProvider: () => ({ name: "test" }),
  generateStructured: mocks.generate,
}));

const id = "10000000-0000-4000-8000-000000000001";
function form(kind = "study") {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    id,
    kind,
    material: "Anuncio",
    materialObjective: "Comunicar precio",
    brandObjective: "Posicionamiento",
  }))
    data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  mocks.count = 0;
  mocks.countError = false;
  const query = {
    select: () => query,
    eq: () => query,
    gte: async () => ({
      count: mocks.count,
      error: mocks.countError ? {} : null,
    }),
  };
  mocks.requireUser.mockResolvedValue({
    user: { id: "researcher" },
    supabase: { from: () => ({ ...query, insert: mocks.insert }) },
  });
  mocks.study.mockResolvedValue({
    n: 3,
    aggregates: { nIncluded: 3, mean: 5 },
  });
  mocks.battery.mockResolvedValue({
    n: 3,
    canAnalyze: true,
    aggregates: { nIncluded: 3 },
  });
  mocks.generate.mockResolvedValue({
    data: { summary: "Resultado" },
    model: "test-model",
  });
  mocks.insert.mockResolvedValue({ error: null });
});
describe("research analysis server action", () => {
  it("requires context before authenticating or calling AI", async () => {
    const data = form();
    data.set("brandObjective", " ");
    expect((await runResearchAnalysis({}, data)).error).toBeTruthy();
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("does not analyze inaccessible studies", async () => {
    mocks.study.mockResolvedValue(null);
    expect((await runResearchAnalysis({}, form())).error).toContain(
      "No se encontró",
    );
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("requires a minimum sample, including tool quality for batteries", async () => {
    mocks.study.mockResolvedValue({ n: 2 });
    expect((await runResearchAnalysis({}, form())).error).toContain(
      "al menos 3",
    );
    mocks.battery.mockResolvedValue({ n: 10, canAnalyze: false });
    expect((await runResearchAnalysis({}, form("battery"))).error).toContain(
      "datos utilizables",
    );
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("stops on history errors and rate limits", async () => {
    mocks.countError = true;
    expect((await runResearchAnalysis({}, form())).error).toContain(
      "historial",
    );
    mocks.countError = false;
    mocks.count = 10;
    expect((await runResearchAnalysis({}, form())).error).toContain("límite");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it.each(["study", "battery"])(
    "saves validated context and aggregate snapshots for %s",
    async (kind) => {
      expect(await runResearchAnalysis({}, form(kind))).toEqual({ ok: true });
      expect(mocks.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.stringContaining('"material":"Anuncio"'),
        }),
      );
      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          [kind === "study" ? "study_id" : "battery_id"]: id,
          context: expect.objectContaining({
            brandObjective: "Posicionamiento",
          }),
          n_sessions: 3,
          model: "test-model",
          aggregates: expect.objectContaining({ nIncluded: 3 }),
        }),
      );
      expect(mocks.revalidate).toHaveBeenCalledWith(
        `/${kind === "study" ? "studies" : "batteries"}/${id}/analysis`,
      );
    },
  );
  it("reports save failures instead of claiming success", async () => {
    mocks.insert.mockResolvedValue({ error: {} });
    expect((await runResearchAnalysis({}, form())).error).toContain(
      "no se pudo guardar",
    );
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
