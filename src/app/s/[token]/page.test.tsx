import { beforeEach, describe, expect, it, vi } from "vitest";
import ParticipantPage from "./page";
import { Runner } from "@/tools/iat/runner/Runner";
import { SurveyRunner } from "@/tools/survey/runner/SurveyRunner";
import { VariantRunner } from "@/tools/variants/runner/VariantRunner";
import { EyeStudyRunner } from "@/tools/visual/eye/EyeStudyRunner";

const mocks = vi.hoisted(() => ({ load: vi.fn(), eye: vi.fn() }));
vi.mock("@/lib/participant-api", () => ({
  loadParticipantStudyByToken: mocks.load,
  apiMessage: (code: string) => code,
  availabilityError: (study: { status: string }) => study.status === "published" ? null : "closed",
}));
vi.mock("@/tools/visual/eye/participant.server", () => ({ loadEyeStudyByToken: mocks.eye }));
vi.mock("@/tools/iat/runner/Runner", () => ({ Runner: () => null }));
vi.mock("@/tools/survey/runner/SurveyRunner", () => ({ SurveyRunner: () => null }));
vi.mock("@/tools/variants/runner/VariantRunner", () => ({ VariantRunner: () => null }));
vi.mock("@/tools/visual/eye/EyeStudyRunner", () => ({ EyeStudyRunner: () => null }));

const token = "a".repeat(43);
const study = { id: "study", name: "Webcam", status: "published", closes_at: null, config: {} };
const page = (preview = false) => ParticipantPage({ params: Promise.resolve({ token }), searchParams: Promise.resolve(preview ? { preview: "1" } : {}) });
beforeEach(() => { vi.resetAllMocks(); });

describe("Ligas de participantes tras integrar eye tracking", () => {
  it.each([["iat", Runner], ["survey", SurveyRunner], ["iat_variant", VariantRunner]] as const)("conserva el runner de %s", async (tool, runner) => {
    mocks.load.mockResolvedValue({ ok: true, tool, study });
    const result = await page();
    expect(result.type).toBe(runner);
    expect(mocks.eye).not.toHaveBeenCalled();
  });

  it("abre eye tracking con sus imágenes firmadas cuando el token no corresponde a las otras herramientas", async () => {
    mocks.load.mockResolvedValue({ ok: false, code: "invalid_link" });
    mocks.eye.mockResolvedValue({ ok: true, study });
    const result = await page();
    expect(result.type).toBe(EyeStudyRunner);
    expect(result.props).toMatchObject({ token, study, preview: false });
    expect(mocks.eye).toHaveBeenCalledWith(token, true);
  });

  it("mantiene los errores del servidor sin intentar abrir otro tipo de estudio", async () => {
    mocks.load.mockResolvedValue({ ok: false, code: "server_error" });
    expect((await page()).props.message).toBe("server_error");
    expect(mocks.eye).not.toHaveBeenCalled();
  });

  it("bloquea eye tracking cerrado y conserva la vista previa del investigador", async () => {
    mocks.load.mockResolvedValue({ ok: false, code: "invalid_link" });
    mocks.eye.mockResolvedValue({ ok: true, study: { ...study, status: "closed" } });
    expect((await page()).props.message).toBe("closed");
    expect((await page(true)).type).toBe(EyeStudyRunner);
  });
});
