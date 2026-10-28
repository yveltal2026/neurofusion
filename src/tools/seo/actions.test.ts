import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateSeoPlan, runSeoLiveAudit, updateSeoConfig } from "./actions";
import { runUploadAudit } from "./crawl";
import type { SeoAuditRow } from "@/lib/db/types";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  generate: vi.fn(),
  crawl: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
vi.mock("@/lib/ai", async () => ({
  ...(await import("@/lib/ai/types")),
  generateStructured: mocks.generate,
  getAnalysisProvider: () => ({ name: "test" }),
}));
vi.mock("./crawl", async () => ({
  ...(await vi.importActual<typeof import("./crawl")>("./crawl")),
  runLiveAudit: mocks.crawl,
}));
const studyId = "10000000-0000-4000-8000-000000000001";
const auditId = "10000000-0000-4000-8000-000000000002";
const snapshot = () =>
  runUploadAudit(
    { siteUrl: "https://demo.mx/", targetKeyword: "palabra-histórica" },
    [{ url: "https://demo.mx/", html: "<title>Título</title>" }],
    () => 0,
  );
const plan = {
  executiveSummary: "Diagnóstico",
  priorities: [],
  quickWins: [],
  rewrites: [],
  limitations: [],
};
function database({ quota = 0, denied = false, writeError = false } = {}) {
  const insert = vi.fn();
  const update = vi.fn();
  const filters: unknown[][] = [];
  const out = snapshot();
  const saved = {
    id: auditId,
    study_id: studyId,
    site_url: out.siteUrl,
    mode: out.mode,
    engine_version: out.engineVersion,
    summary: out.summary,
    pages: out.pages,
    findings: out.findings,
    performance: null,
    notes: [],
    duration_ms: 1,
    created_at: "2026-10-28T00:00:00Z",
    ai_result: null,
  } as unknown as SeoAuditRow;
  const supabase = {
    from: (table: string) => {
      let count = false;
      const q = {
        select: (_?: string, options?: { head?: boolean }) => {
          count = Boolean(options?.head);
          return q;
        },
        eq: (...args: unknown[]) => {
          filters.push(args);
          return q;
        },
        gte: () => q,
        update: (patch: unknown) => {
          update(patch);
          return q;
        },
        insert: (patch: unknown) => {
          insert(patch);
          return q;
        },
        single: async () => ({
          data: writeError ? null : { id: auditId },
          error: writeError ? { message: "denied" } : null,
        }),
        maybeSingle: async () => ({
          data:
            table === "studies"
              ? denied
                ? null
                : {
                    id: studyId,
                    config: {
                      siteUrl: "https://demo.mx/",
                      targetKeyword: "palabra-actual",
                    },
                  }
              : saved,
        }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            count: count ? quota : null,
            data: denied ? [] : [{ id: studyId }],
            error: writeError ? { message: "denied" } : null,
          }).then(resolve),
      };
      return q;
    },
  };
  mocks.auth.mockResolvedValue({ supabase });
  return { insert, update, filters, saved };
}
function request() {
  const fd = new FormData();
  fd.set("studyId", studyId);
  fd.set("auditId", auditId);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.crawl.mockResolvedValue(snapshot());
  mocks.generate.mockResolvedValue({ data: plan, model: "test-model" });
});

describe("acciones SEO con objetivos y contexto histórico", () => {
  it("guarda objetivos validados y mantiene el filtro de estudio SEO", async () => {
    const db = database();
    const fd = request();
    fd.set("siteUrl", "https://demo.mx/");
    fd.append("targetUrl", "https://demo.mx/producto");
    fd.append("pageKeyword", "producto");
    fd.append("pageGoal", "Cotizar");
    fd.append("pageIndexing", "exclude");
    expect(await updateSeoConfig({}, fd)).toEqual({ ok: true });
    expect(db.update.mock.calls[0][0].config.pageTargets).toEqual([
      {
        url: "https://demo.mx/producto",
        keyword: "producto",
        goal: "Cotizar",
        indexable: false,
      },
    ]);
    expect(db.filters).toContainEqual(["id", studyId]);
    expect(db.filters).toContainEqual(["tool_type", "seo"]);
  });
  it("rechaza objetivos de otros sitios antes de escribir", async () => {
    const db = database();
    const fd = request();
    fd.set("siteUrl", "https://demo.mx/");
    fd.append("targetUrl", "https://otro.mx/");
    expect((await updateSeoConfig({}, fd)).error).toContain("pertenecer");
    expect(db.update).not.toHaveBeenCalled();
  });
  it("persiste cobertura y objetivos del resultado de auditoría", async () => {
    const db = database();
    await expect(runSeoLiveAudit({}, request())).rejects.toThrow(
      `/studies/${studyId}/audits/${auditId}`,
    );
    const inserted = db.insert.mock.calls[0][0];
    expect(inserted.study_id).toBe(studyId);
    expect(inserted.summary.coverage.htmlPages).toBe(1);
    expect(inserted.summary.scope.targetKeyword).toBe("palabra-histórica");
    expect(inserted.pages[0].target.keyword).toBe("palabra-histórica");
  });
  it("no rastrea cuando no hay acceso o se alcanzó la cuota", async () => {
    database({ denied: true });
    expect((await runSeoLiveAudit({}, request())).error).toContain(
      "no encontrado",
    );
    database({ quota: 6 });
    expect((await runSeoLiveAudit({}, request())).error).toContain("límite");
    expect(mocks.crawl).not.toHaveBeenCalled();
  });
  it("no anuncia éxito cuando falla la persistencia", async () => {
    database({ writeError: true });
    expect((await runSeoLiveAudit({}, request())).error).toContain(
      "no se pudo guardar",
    );
  });
  it("redacta con la palabra histórica y no con los ajustes actuales", async () => {
    const db = database();
    expect(await generateSeoPlan({}, request())).toEqual({ ok: true });
    const prompt = mocks.generate.mock.calls[0][0].user as string;
    expect(prompt).toContain("palabra-histórica");
    expect(prompt).not.toContain("palabra-actual");
    expect(db.update.mock.calls[0][0].ai_result).toEqual(plan);
  });
});
