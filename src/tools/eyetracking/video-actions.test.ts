import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestResearcherVideoUpload,
  saveStudyVideoSource,
  saveStudyVideoAois,
} from "./actions";

const control = vi.hoisted(() => ({
  auth: vi.fn(),
  upload: vi.fn(),
  revalidate: vi.fn(),
  blocked: false,
  found: true,
  update: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireUser: control.auth }));
vi.mock("next/cache", () => ({ revalidatePath: control.revalidate }));
vi.mock("@/tools/visual/video/r2.server", async (original) => ({
  ...(await original<typeof import("@/tools/visual/video/r2.server")>()),
  readR2Config: () => ({
    accountId: "fake",
    accessKeyId: "test",
    secretAccessKey: "test",
    bucket: "test",
  }),
  createR2VideoUploadSession: control.upload,
}));
const studyId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const key = `studies/${studyId}/videos/${assetId}.mp4`;
beforeEach(() => {
  vi.clearAllMocks();
  control.blocked = false;
  control.found = true;
  control.auth.mockResolvedValue({
    supabase: {
      from: (table: string) => {
        const q = {
          select: vi.fn(() => q),
          eq: vi.fn(() => q),
          gte: vi.fn(() => q),
          maybeSingle: async () => ({
            data: control.found
              ? {
                  id: studyId,
                  config: {
                    mode: "pieces",
                    objective: "Atención",
                    brand: "",
                    audience: "",
                    eyeTracking: {
                      mediaType: "video",
                      durationSeconds: 10,
                      video: { maxDurationSeconds: 120, scenes: [], aois: [] },
                    },
                  },
                }
              : null,
            error: null,
          }),
          update: (value: unknown) => {
            control.update(value);
            return q;
          },
          then: (resolve: (r: unknown) => unknown) =>
            Promise.resolve({
              error: null,
              count: table === "sessions" && control.blocked ? 1 : 0,
            }).then(resolve),
        };
        return q;
      },
    },
  });
});

describe("acciones de video con permisos de CognIA", () => {
  it("rechaza claves de otro estudio antes de escribir o firmar", async () => {
    const result = await saveStudyVideoSource({
      studyId,
      r2Key: `studies/${assetId}/videos/${assetId}.mp4`,
    });
    expect(result.error).toMatch(/no pertenece/);
    expect(control.update).not.toHaveBeenCalled();
    expect(control.upload).not.toHaveBeenCalled();
  });
  it("no firma ni modifica un estudio que las políticas del usuario no permiten consultar", async () => {
    control.found = false;
    expect(
      (
        await requestResearcherVideoUpload({
          studyId,
          mimeType: "video/mp4",
          byteLength: 2048,
        })
      ).error,
    ).toMatch(/No se encontró/);
    expect(control.upload).not.toHaveBeenCalled();
  });
  it("aplica el bloqueo de respuestas/sesiones también a solicitudes directas", async () => {
    control.blocked = true;
    for (const action of [
      () => saveStudyVideoSource({ studyId, r2Key: key }),
      () => saveStudyVideoAois({ studyId, aois: [] }),
      () =>
        requestResearcherVideoUpload({
          studyId,
          mimeType: "video/mp4",
          byteLength: 2048,
        }),
    ]) {
      expect((await action()).error).toMatch(/sesiones en curso/);
    }
    expect(control.update).not.toHaveBeenCalled();
    expect(control.upload).not.toHaveBeenCalled();
  });
  it("guarda la clave propia sin persistir una URL firmada que caducará", async () => {
    expect(
      await saveStudyVideoSource({
        studyId,
        r2Key: key,
        playbackUrl: "https://example.test/temporary?signature=test",
        durationMs: 2000,
      }),
    ).toEqual({ ok: true });
    expect(control.update).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          eyeTracking: expect.objectContaining({
            video: expect.objectContaining({
              r2Key: key,
              playbackUrl: undefined,
              durationMs: 2000,
            }),
          }),
        }),
      }),
    );
  });
  it("rechaza duración fuera del estudio y permite cambiar a enlace sin retener la clave anterior", async () => {
    expect(
      (await saveStudyVideoSource({ studyId, r2Key: key, durationMs: 125000 }))
        .error,
    ).toMatch(/duración máxima/);
    expect(control.update).not.toHaveBeenCalled();
    await saveStudyVideoSource({
      studyId,
      playbackUrl: "https://example.test/spot.mp4",
    });
    expect(control.update).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          eyeTracking: expect.objectContaining({
            video: expect.objectContaining({
              r2Key: undefined,
              playbackUrl: "https://example.test/spot.mp4",
            }),
          }),
        }),
      }),
    );
  });
});
