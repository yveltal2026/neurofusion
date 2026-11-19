import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
import { GET } from "@/app/api/studies/[id]/eye/export/route";
const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
it("exporta mirada y señales faciales con las mismas 24 columnas y su calidad alineada", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const quality = { engineId: "webeyetrack@0.0.2", medianErrorDeg: 2, coverage: 1, fps: 30, validRatio: 1, passed: true, calibrationClicks: 18, calibrationLayout: "v5-weighted-refinement" };
  const observation = { assetId: id, durationMs: 2000, framesTotal: 10, framesValid: 5, gazeSamples: [{ t: 100, x: 0.2, y: 0.3 }], facialSamples: [{ t: 100, poseValid: true, au01: 0, au02: 0, au04: 0, au06: 80, au07: 0, au09: 0, au10: 0, au12: 70, au14: 0, au15: 0, au24: 0, au26: 0, blink: false }] };
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id } } }) }, from: (table: string) => {
    let offset = 0;
    const q = {
      select: () => q, eq: () => q, order: () => q, in: () => q,
      range: (start: number) => { offset = start; return q; },
      maybeSingle: async () => ({ data: { config: { mode: "pieces", objective: "Atención", eyeTracking: { mediaType: "video", durationSeconds: 10 } } } }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === "eye_tracking_runs" ? offset ? [] : [{ session_id: id, validation: quality, observations: [observation] }] : [{ id, participant_ref: "P01", excluded: false }], error: null }).then(resolve),
    }; return q;
  } });
  const response = await GET(new NextRequest(`https://example.test/api/studies/${id}/eye/export`), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(200);
  const rows = (await response.text()).trim().split("\n").map(row => row.split(","));
  expect(rows).toHaveLength(3); expect(rows.every(row => row.length === 24)).toBe(true);
  const gaze = Object.fromEntries(rows[0].map((header, i) => [header, rows[1][i]]));
  const facial = Object.fromEntries(rows[0].map((header, i) => [header, rows[2][i]]));
  expect(gaze).toMatchObject({ record_type: "gaze", x_norm: "0.2", pose_valid: "", blink: "", calibration_pass: "true", error_deg: "2" });
  expect(facial).toMatchObject({ record_type: "facial", x_norm: "", pose_valid: "true", au12: "70", calibration_pass: "true" });
});
