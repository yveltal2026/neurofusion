import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEyeTrackingStudy } from "./actions";
import { analyzeAsset, createVisualStudy, restoreAiAois } from "@/tools/visual/actions";
import { loadVisualStudyPage } from "@/tools/visual/load";
import { getStudyTool, getTool } from "@/tools/registry";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const id = "10000000-0000-4000-8000-000000000001";
const eyeConfig = { mode: "pieces", objective: "Ver atención al precio", brand: "", audience: "", eyeTracking: { durationSeconds: 15 } };
const study = { id, project_id: id, tool_type: "visual", config: eyeConfig };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation(() => { throw new Error("REDIRECT"); });
  mocks.notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
});

describe("Separación de herramientas", () => {
  it("reconoce los estudios de webcam existentes y ofrece una ruta propia", () => {
    expect(getStudyTool(study)?.type).toBe("eyetracking");
    expect(getStudyTool({ ...study, config: { mode: "pieces", objective: "IA" } })?.type).toBe("visual");
    expect(getTool("eyetracking")?.newStudyPath(id)).toBe(`/projects/${id}/studies/new/eyetracking`);
  });

  it("la acción de IA rechaza configuraciones de webcam antes de escribir", async () => {
    const result = await createVisualStudy({ projectId: id, name: "Test", config: eyeConfig });
    expect(result.error).toContain("Eye tracking");
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it("la creación de eye tracking exige medición con webcam y duración válida", async () => {
    for (const config of [{ mode: "pieces", objective: "IA" }, { ...eyeConfig, eyeTracking: { durationSeconds: 31 } }, { ...eyeConfig, mode: "journey" }]) {
      expect((await createEyeTrackingStudy({ projectId: id, name: "Test", config })).error).toBeTruthy();
    }
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it("crea una liga de participación y conserva el formato de almacenamiento compatible", async () => {
    const insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id }, error: null }) }) });
    mocks.requireUser.mockResolvedValue({ supabase: { from: () => ({ insert }) } });
    await expect(createEyeTrackingStudy({ projectId: id, name: "Webcam", config: eyeConfig })).rejects.toThrow("REDIRECT");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ config: eyeConfig, access_token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) }));
    expect(mocks.redirect).toHaveBeenCalledWith(`/studies/${id}?created=1`);
  });

  it("no permite ejecutar ni restaurar análisis de IA en un estudio de webcam", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: async () => ({ data: study }) };
    const from = vi.fn().mockReturnValue(query);
    const storage = { from: vi.fn() };
    mocks.requireUser.mockResolvedValue({ supabase: { from, storage } });
    const fd = new FormData(); fd.set("studyId", id); fd.set("assetId", id);
    expect((await analyzeAsset({}, fd)).error).toContain("otra herramienta");
    await restoreAiAois(fd);
    expect(from.mock.calls.every(([table]) => table === "studies")).toBe(true);
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("las páginas de informes de IA excluyen webcam; el detalle de imagen sí puede abrirlo", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: async () => ({ data: study }) };
    const supabase = { from: vi.fn().mockReturnValue(query) } as unknown as Parameters<typeof loadVisualStudyPage>[0];
    await expect(loadVisualStudyPage(supabase, id)).rejects.toThrow("NOT_FOUND");
    await expect(loadVisualStudyPage(supabase, id, "pieces")).rejects.toThrow("NOT_FOUND");
    await expect(loadVisualStudyPage(supabase, id, undefined, true)).resolves.toMatchObject({ study, config: eyeConfig });
  });
});
