import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEyeAggregates } from "./eye-load";
vi.mock("@/tools/visual/results", () => ({
  loadAssets: async () => [
    {
      row: {
        id: "10000000-0000-4000-8000-000000000001",
        title: "Anuncio",
        width: 1000,
        height: 500,
      },
      aois: [],
    },
  ],
}));

const observation = {
  assetId: "10000000-0000-4000-8000-000000000001",
  durationMs: 5000,
  framesTotal: 100,
  framesValid: 100,
  samples: [{ t: 0, x: 0.5, y: 0.5 }],
};
const quality = {
  engineId: "webeyetrack@0.0.2",
  medianErrorDeg: 2,
  coverage: 1,
  fps: 30,
  validRatio: 1,
  passed: true,
  calibrationClicks: 9,
  calibrationLayout: "v2-corners-last",
};

it("scopes to completed battery participants and excludes manual, poor quality and limited runs", async () => {
  const sessions = [
    { id: "good", excluded: false, battery_session_id: "b1" },
    { id: "duplicate-good", excluded: false, battery_session_id: "b1" },
    { id: "excluded", excluded: true, battery_session_id: "b2" },
    { id: "poor", excluded: false, battery_session_id: "b3" },
    { id: "limited", excluded: false, battery_session_id: "b4" },
    { id: "other-battery", excluded: false, battery_session_id: "b5" },
  ];
  const runs = sessions.map((s) => ({
    session_id: s.id,
    validation: {
      ...quality,
      passed: s.id !== "poor",
      ...(s.id === "limited" ? { measurementStatus: "limited" } : {}),
    },
    observations: [observation],
  }));
  const queries: string[] = [];
  const supabase = {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (key: string, value: string) => {
          queries.push(`${key}:${value}`);
          return query;
        },
        order: () => query,
        range: async () => ({
          data: table === "sessions" ? sessions : runs,
          error: null,
        }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const result = await loadEyeAggregates(supabase, "study", [
    "b1",
    "b2",
    "b3",
    "b4",
  ]);
  expect(result).toMatchObject({
    nTotal: 4,
    nIncluded: 1,
    nExcludedOrLowQuality: 3,
  });
  expect(result.pieces[0]?.n).toBe(1);
  expect(queries).toContain("status:completed");
  expect(JSON.stringify(result)).not.toContain("session_id");
  expect(JSON.stringify(result)).not.toContain("samples");
  expect((await loadEyeAggregates(supabase, "study", [])).nIncluded).toBe(0);
});
