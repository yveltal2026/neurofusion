import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  exposureStepsWithoutPieces,
  loadAvailableStudies,
  pieceCounts,
} from "./load";

type Result = { data: unknown; error: unknown };

/** Cliente falso: cada tabla devuelve filas fijas; guarda los filtros para comprobar qué se pidió. */
function fakeSupabase(tables: Record<string, unknown[]>) {
  const asked: { table: string; select?: string; in?: [string, unknown] }[] =
    [];
  const supabase = {
    from: (table: string) => {
      const call: (typeof asked)[number] = { table };
      asked.push(call);
      const b: Record<string, unknown> = {};
      b.select = (cols: string) => ((call.select = cols), b);
      b.eq = () => b;
      b.in = (c: string, v: unknown) => ((call.in = [c, v]), b);
      b.order = () => b;
      b.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve({ data: tables[table] ?? [], error: null }).then(
          res,
          rej,
        );
      return b;
    },
  };
  return { supabase: supabase as unknown as SupabaseClient, asked };
}

describe("loadAvailableStudies", () => {
  const studies = [
    { id: "i1", name: "IAT", tool_type: "iat", mode: null },
    { id: "v1", name: "SC-IAT", tool_type: "iat_variant", mode: null },
    { id: "s1", name: "Encuesta", tool_type: "survey", mode: null },
    { id: "p1", name: "Anuncio", tool_type: "visual", mode: "pieces" },
    { id: "p0", name: "Vacío", tool_type: "visual", mode: "pieces" },
    { id: "j1", name: "Journey", tool_type: "visual", mode: "journey" },
    { id: "x1", name: "SEO", tool_type: "seo", mode: null },
  ];
  const assets = [{ study_id: "p1" }, { study_id: "p1" }, { study_id: "p1" }];

  it("ofrece IAT, variantes, encuestas e imágenes en modo piezas; no journey ni SEO", async () => {
    const f = fakeSupabase({ studies, visual_assets: assets });
    const out = await loadAvailableStudies(f.supabase, "proj");
    expect(out.map((s) => s.studyId)).toEqual(["i1", "v1", "s1", "p1", "p0"]);
    expect(out.map((s) => s.toolType)).toEqual([
      "iat",
      "iat_variant",
      "survey",
      "visual",
      "visual",
    ]);
  });

  it("los estudios de imagen traen cuántas imágenes tienen; los demás no", async () => {
    const f = fakeSupabase({ studies, visual_assets: assets });
    const out = await loadAvailableStudies(f.supabase, "proj");
    expect(out.find((s) => s.studyId === "p1")!.pieces).toBe(3);
    expect(out.find((s) => s.studyId === "p0")!.pieces).toBe(0);
    expect("pieces" in out.find((s) => s.studyId === "i1")!).toBe(false);
  });

  it("pide el modo del estudio sin traer toda su configuración", async () => {
    const f = fakeSupabase({ studies, visual_assets: assets });
    await loadAvailableStudies(f.supabase, "proj");
    expect(f.asked[0]!.select).toBe("id, name, tool_type, mode:config->>mode");
    expect(f.asked[0]!.in).toEqual([
      "tool_type",
      ["iat", "iat_variant", "survey", "visual"],
    ]);
  });
});

describe("pieceCounts", () => {
  it("cuenta por estudio y deja en cero los que no tienen imágenes", async () => {
    const f = fakeSupabase({
      visual_assets: [{ study_id: "a" }, { study_id: "a" }, { study_id: "b" }],
    });
    const counts = await pieceCounts(f.supabase, ["a", "b", "c"]);
    expect([...counts]).toEqual([
      ["a", 2],
      ["b", 1],
      ["c", 0],
    ]);
  });

  it("no consulta nada si no hay estudios", async () => {
    const f = fakeSupabase({});
    expect((await pieceCounts(f.supabase, [])).size).toBe(0);
    expect(f.asked).toEqual([]);
  });
});

describe("exposureStepsWithoutPieces", () => {
  it("nombra los pasos activos de imagen sin imágenes", async () => {
    const f = fakeSupabase({
      studies: [
        { id: "p1", name: "Con piezas" },
        { id: "p0", name: "Sin piezas" },
      ],
      visual_assets: [{ study_id: "p1" }],
    });
    expect(
      await exposureStepsWithoutPieces(f.supabase, [
        { studyId: "p1", enabled: true },
        { studyId: "p0", enabled: true },
      ]),
    ).toEqual(["Sin piezas"]);
  });

  it("ignora los pasos omitidos y no consulta si no queda ninguno activo", async () => {
    const f = fakeSupabase({});
    expect(
      await exposureStepsWithoutPieces(f.supabase, [
        { studyId: "p0", enabled: false },
      ]),
    ).toEqual([]);
    expect(f.asked).toEqual([]);
  });

  it("si ningún paso activo es de imagen, no cuenta piezas", async () => {
    const f = fakeSupabase({ studies: [] });
    expect(
      await exposureStepsWithoutPieces(f.supabase, [
        { studyId: "i1", enabled: true },
      ]),
    ).toEqual([]);
    expect(f.asked.map((c) => c.table)).toEqual(["studies"]);
  });
});
