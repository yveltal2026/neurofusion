import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { validVariantConfig } from "@/tools/variants/defaults";
import {
  completeExposureStep,
  loadStepLinks,
  startExposureStep,
} from "./participant";

type Result = { data: unknown; error: unknown };
const ok = (data: unknown): Result => ({ data, error: null });

const VISUAL_PIECES = { mode: "pieces", objective: "Medir un anuncio" };

/** Cliente falso con las tablas que lee `loadStepLinks`, el almacenamiento firmado y el `rpc`. */
function fakeAdmin(
  opts: {
    studies?: unknown[];
    assets?: unknown[];
    assetsError?: boolean;
    unsigned?: string[];
    rpc?: Record<string, Result>;
    batterySession?: { id: string; battery_id: string } | null;
  } = {},
) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const builder = (result: Result) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order"]) b[m] = () => b;
    b.maybeSingle = async () => result;
    b.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return b;
  };
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return opts.rpc?.[name] ?? ok(null);
    },
    from: (table: string) => {
      if (table === "studies") return builder(ok(opts.studies ?? []));
      if (table === "visual_assets")
        return builder(
          opts.assetsError
            ? { data: null, error: { message: "x" } }
            : ok(opts.assets ?? []),
        );
      if (table === "battery_sessions")
        return builder(ok(opts.batterySession ?? null));
      return builder(ok(null));
    },
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths
            .filter((p) => !(opts.unsigned ?? []).includes(p))
            .map((p) => ({ path: p, signedUrl: `https://signed.test/${p}` })),
        }),
      }),
    },
  };
  return { admin: admin as unknown as SupabaseClient, rpcCalls };
}

const variantStudy = {
  id: "var-1",
  tool_type: "iat_variant",
  access_token: "t".repeat(43),
  config: validVariantConfig("sc_iat"),
};
const visualStudy = {
  id: "vis-1",
  tool_type: "visual",
  access_token: null,
  config: VISUAL_PIECES,
};
const asset = (id: string, path: string) => ({
  id,
  title: `Pieza ${id}`,
  width: 1200,
  height: 628,
  storage_path: path,
});

describe("loadStepLinks · variantes e imagen con IA", () => {
  it("devuelve cada paso en su orden con lo que necesita su runner", async () => {
    const f = fakeAdmin({
      studies: [visualStudy, variantStudy],
      assets: [asset("a1", "vis-1/a1.png"), asset("a2", "vis-1/a2.png")],
    });
    const res = await loadStepLinks(f.admin, ["vis-1", "var-1"]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.steps.map((s) => s.tool)).toEqual(["visual", "iat_variant"]);

    const [visual, variant] = res.steps;
    expect(variant).toMatchObject({
      studyId: "var-1",
      token: variantStudy.access_token,
    });
    // El paso de exposición no tiene liga propia: trae las piezas con URL firmada (versión ligera).
    expect(visual).toMatchObject({ studyId: "vis-1", tool: "visual" });
    expect(visual && "token" in visual).toBe(false);
    if (visual?.tool !== "visual")
      throw new Error("se esperaba un paso visual");
    expect(visual.pieces).toEqual([
      {
        id: "a1",
        title: "Pieza a1",
        width: 1200,
        height: 628,
        url: "https://signed.test/vis-1/view-a1.webp",
      },
      {
        id: "a2",
        title: "Pieza a2",
        width: 1200,
        height: 628,
        url: "https://signed.test/vis-1/view-a2.webp",
      },
    ]);
  });

  it("usa el original si la versión ligera no existe", async () => {
    const f = fakeAdmin({
      studies: [visualStudy],
      assets: [asset("a1", "vis-1/a1.png")],
      unsigned: ["vis-1/view-a1.webp"],
    });
    const res = await loadStepLinks(f.admin, ["vis-1"]);
    if (!res.ok || res.steps[0]?.tool !== "visual") throw new Error("falló");
    expect(res.steps[0].pieces[0]!.url).toBe(
      "https://signed.test/vis-1/a1.png",
    );
  });

  it("omite las imágenes que no se pudieron firmar", async () => {
    const f = fakeAdmin({
      studies: [visualStudy],
      assets: [asset("a1", "vis-1/a1.png"), asset("a2", "vis-1/a2.png")],
      unsigned: ["vis-1/view-a2.webp", "vis-1/a2.png"],
    });
    const res = await loadStepLinks(f.admin, ["vis-1"]);
    if (!res.ok || res.steps[0]?.tool !== "visual") throw new Error("falló");
    expect(res.steps[0].pieces.map((p) => p.id)).toEqual(["a1"]);
  });

  it("una medición con webcam no se ejecuta como exposición de imágenes", async () => {
    const f = fakeAdmin({ studies: [{ ...visualStudy, config: { ...VISUAL_PIECES, eyeTracking: { durationSeconds: 10 } } }] });
    expect(await loadStepLinks(f.admin, ["vis-1"])).toEqual({ ok: false, code: "server_error" });
  });

  it("un estudio visual en modo journey no puede ser paso", async () => {
    const f = fakeAdmin({
      studies: [
        { ...visualStudy, config: { ...VISUAL_PIECES, mode: "journey" } },
      ],
    });
    expect(await loadStepLinks(f.admin, ["vis-1"])).toEqual({
      ok: false,
      code: "server_error",
    });
  });

  it("una configuración de variante inválida o un error de lectura es server_error", async () => {
    expect(
      await loadStepLinks(
        fakeAdmin({ studies: [{ ...variantStudy, config: {} }] }).admin,
        ["var-1"],
      ),
    ).toEqual({ ok: false, code: "server_error" });
    expect(
      await loadStepLinks(
        fakeAdmin({ studies: [visualStudy], assetsError: true }).admin,
        ["vis-1"],
      ),
    ).toEqual({ ok: false, code: "server_error" });
  });

  it("un estudio que no es paso (p. ej. SEO) se rechaza", async () => {
    const f = fakeAdmin({
      studies: [
        { id: "seo-1", tool_type: "seo", access_token: null, config: {} },
      ],
    });
    expect(await loadStepLinks(f.admin, ["seo-1"])).toEqual({
      ok: false,
      code: "server_error",
    });
  });
});

describe("pasos de exposición", () => {
  const mine = { id: "bs-1", battery_id: "bat-1" };

  it("abre la sesión del paso con la sesión de batería y el estudio", async () => {
    const f = fakeAdmin({
      batterySession: mine,
      rpc: {
        start_battery_exposure: ok([{ outcome: "ok", new_session_id: "ex-1" }]),
      },
    });
    expect(await startExposureStep(f.admin, "bat-1", "bs-1", "vis-1")).toEqual({
      ok: true,
      sessionId: "ex-1",
    });
    expect(f.rpcCalls).toEqual([
      {
        name: "start_battery_exposure",
        args: { p_battery_session: "bs-1", p_study: "vis-1" },
      },
    ]);
  });

  it("no toca la base si la sesión de batería es de otra batería o no existe", async () => {
    const other = fakeAdmin({
      batterySession: { id: "bs-1", battery_id: "otra" },
    });
    expect(
      await startExposureStep(other.admin, "bat-1", "bs-1", "vis-1"),
    ).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(other.rpcCalls).toEqual([]);
    const none = fakeAdmin({ batterySession: null });
    expect(
      await completeExposureStep(none.admin, "bat-1", "bs-1", "ex-1"),
    ).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(none.rpcCalls).toEqual([]);
  });

  it.each([
    ["out_of_order", "out_of_order"],
    ["battery_session_closed", "closed"],
    ["study_not_in_battery", "invalid_data"],
    ["not_exposure", "invalid_data"],
    ["session_not_found", "not_found"],
    ["algo_raro", "server_error"],
  ])("al abrir, el resultado %s se traduce a %s", async (outcome, code) => {
    const f = fakeAdmin({
      batterySession: mine,
      rpc: {
        start_battery_exposure: ok([{ outcome, new_session_id: null }]),
      },
    });
    expect(await startExposureStep(f.admin, "bat-1", "bs-1", "vis-1")).toEqual({
      ok: false,
      code,
    });
  });

  it("un ok sin id de sesión es server_error", async () => {
    const f = fakeAdmin({
      batterySession: mine,
      rpc: {
        start_battery_exposure: ok([{ outcome: "ok", new_session_id: null }]),
      },
    });
    expect(await startExposureStep(f.admin, "bat-1", "bs-1", "vis-1")).toEqual({
      ok: false,
      code: "server_error",
    });
  });

  it("cierra el paso y traduce los rechazos de la base", async () => {
    const good = fakeAdmin({
      batterySession: mine,
      rpc: { complete_battery_exposure: ok("ok") },
    });
    expect(
      await completeExposureStep(good.admin, "bat-1", "bs-1", "ex-1"),
    ).toEqual({
      ok: true,
    });
    expect(good.rpcCalls[0]).toEqual({
      name: "complete_battery_exposure",
      args: { p_battery_session: "bs-1", p_session: "ex-1" },
    });
    for (const [outcome, code] of [
      ["not_found", "not_found"],
      ["not_exposure", "invalid_data"],
      ["battery_session_closed", "closed"],
    ] as const) {
      const f = fakeAdmin({
        batterySession: mine,
        rpc: { complete_battery_exposure: ok(outcome) },
      });
      expect(
        await completeExposureStep(f.admin, "bat-1", "bs-1", "ex-1"),
      ).toEqual({
        ok: false,
        code,
      });
    }
  });

  it("un error de la base al cerrar es server_error", async () => {
    const f = fakeAdmin({
      batterySession: mine,
      rpc: {
        complete_battery_exposure: { data: null, error: { message: "x" } },
      },
    });
    expect(
      await completeExposureStep(f.admin, "bat-1", "bs-1", "ex-1"),
    ).toEqual({
      ok: false,
      code: "server_error",
    });
  });
});
