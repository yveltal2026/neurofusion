import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/participant-api", () => ({ loadSurveyByToken: mocks.load }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ download: mocks.download }) },
  }),
}));
import { GET } from "./route";

const studyId = "11111111-1111-4111-8111-111111111111";
const imagePath = `${studyId}/22222222-2222-4222-8222-222222222222.png`;
function study(path = imagePath) {
  return {
    ok: true,
    study: {
      id: studyId,
      status: "published",
      config: {
        blocks: [
          {
            kind: "questions",
            id: "b",
            questions: [
              {
                id: "q",
                type: "text",
                prompt: "Opinión",
                required: true,
                image: { path, alt: "Envase" },
              },
            ],
          },
        ],
      },
    },
  };
}
const request = (token = "valid-token", itemId = "q") =>
  GET(new Request("https://example.com"), {
    params: Promise.resolve({ token, itemId }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(study());
  mocks.download.mockResolvedValue({
    data: new Blob(["png"], { type: "application/octet-stream" }),
    error: null,
  });
});

describe("imagen privada de una pregunta", () => {
  it("entrega sólo la imagen referenciada y evita almacenar en caché una liga revocable", async () => {
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(mocks.download).toHaveBeenCalledWith(imagePath);
  });
  it("no descarga con una liga inválida o regenerada", async () => {
    mocks.load.mockResolvedValue({ ok: false, code: "invalid_link" });
    expect((await request("old-token")).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("no admite ids inexistentes ni rutas que apunten a otro estudio", async () => {
    expect((await request("valid-token", "unknown")).status).toBe(404);
    mocks.load.mockResolvedValue(
      study(imagePath.replace(studyId, "other-study")),
    );
    expect((await request()).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("permite la imagen en la vista previa de un borrador y responde 404 si falta el archivo", async () => {
    const loaded = study();
    loaded.study.status = "draft";
    mocks.load.mockResolvedValue(loaded);
    expect((await request()).status).toBe(200);
    mocks.download.mockResolvedValue({
      data: null,
      error: new Error("missing"),
    });
    expect((await request()).status).toBe(404);
  });
});
