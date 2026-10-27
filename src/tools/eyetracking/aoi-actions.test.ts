import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveEyeAois } from "./aoi-actions";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const studyId = "10000000-0000-4000-8000-000000000001";
const assetId = "10000000-0000-4000-8000-000000000002";
const aoi = {
  id: "A1",
  label: "Logo",
  kind: "logo",
  box: [0, 0, 0.3, 0.2],
  attention: 0,
  importance: 3,
  order: null,
};
const config = {
  mode: "pieces",
  objective: "Atención a la marca",
  eyeTracking: { durationSeconds: 15 },
};
beforeEach(() => vi.clearAllMocks());

function database(
  studyConfig: unknown = config,
  assets: unknown[] | null = [{ id: assetId }],
  updateError: unknown = null,
) {
  const update = vi.fn();
  const eq = vi.fn();
  const studyQuery = {
    select: () => studyQuery,
    eq: () => studyQuery,
    maybeSingle: async () => ({
      data: studyConfig ? { config: studyConfig } : null,
      error: null,
    }),
  };
  const assetQuery = {
    update: (patch: unknown) => {
      update(patch);
      return assetQuery;
    },
    eq: (key: string, value: unknown) => {
      eq(key, value);
      return assetQuery;
    },
    select: async () => ({ data: assets, error: updateError }),
  };
  mocks.requireUser.mockResolvedValue({
    user: { id: "researcher" },
    supabase: {
      from: (table: string) => (table === "studies" ? studyQuery : assetQuery),
    },
  });
  return { update, eq };
}

describe("guardar AOI de webcam", () => {
  it("valida límites, cajas e IDs únicos antes de acceder a la base", async () => {
    for (const aois of [
      [{ ...aoi, box: [-1, 0, 1, 1] }],
      [{ ...aoi, box: [0.3, 0.2, 0, 0] }],
      [aoi, aoi],
    ]) {
      expect(
        (await saveEyeAois({ studyId, assetId, aois })).error,
      ).toBeTruthy();
    }
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });
  it("requiere un estudio de webcam accesible antes de actualizar", async () => {
    for (const c of [null, { mode: "pieces", objective: "IA" }]) {
      const db = database(c);
      expect(
        (await saveEyeAois({ studyId, assetId, aois: [aoi] })).error,
      ).toContain("estudio");
      expect(db.update).not.toHaveBeenCalled();
    }
  });
  it("guarda con filtros de estudio e imagen e invalida ambas vistas", async () => {
    const db = database();
    expect(await saveEyeAois({ studyId, assetId, aois: [aoi] })).toEqual({
      ok: true,
    });
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({
        aois: [aoi],
        aois_source: "analyst",
        aois_reviewed_by: "researcher",
      }),
    );
    expect(db.eq.mock.calls).toEqual([
      ["study_id", studyId],
      ["id", assetId],
    ]);
    expect(mocks.revalidate).toHaveBeenCalledWith(`/studies/${studyId}/eye`);
    expect(mocks.revalidate).toHaveBeenCalledWith(
      `/studies/${studyId}/assets/${assetId}`,
    );
  });
  it("no anuncia éxito si la imagen no pertenece al estudio o falla la escritura", async () => {
    database(config, []);
    expect(
      (await saveEyeAois({ studyId, assetId, aois: [] })).error,
    ).toBeTruthy();
    database(config, null, { message: "denied" });
    expect(
      (await saveEyeAois({ studyId, assetId, aois: [] })).error,
    ).toBeTruthy();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
