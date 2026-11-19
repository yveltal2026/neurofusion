import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as complete } from "@/app/api/s/[token]/eye/complete/route";
import { aggregateVideoStudy } from "./metrics";

const mocks = vi.hoisted(() => ({ load: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/tools/visual/eye/participant.server", () => ({
  loadEyeStudyByToken: mocks.load,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true }) }));

const token = "t".repeat(43);
const ctx = { params: Promise.resolve({ token }) };
const studyId = "11111111-1111-4111-8111-111111111111";
const sessionId = "33333333-3333-4333-8333-333333333333";

function mockDatabase() {
  const upsert = vi.fn(async () => ({ error: null }));
  const update = vi.fn();
  mocks.admin.mockReturnValue({
    from: (table: string) => {
      if (table === "eye_tracking_runs") return { upsert };
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: {
            id: sessionId,
            study_id: studyId,
            status: "started",
            consent_version: "eye-v3",
            device_type: "desktop",
          },
          error: null,
        }),
        update: (patch: unknown) => {
          update(patch);
          return query;
        },
        then: (resolve: (result: unknown) => unknown) =>
          Promise.resolve({ data: [{ id: sessionId }], error: null }).then(
            resolve,
          ),
      };
      return query;
    },
  });
  return { upsert, update };
}

describe("rutas nativas de captura de video + Facial Coding (/api/s/[token]/eye/complete)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({
      ok: true,
      study: {
        id: studyId,
        name: "Spot Video",
        status: "published",
        closes_at: null,
        duplicate_policy: "none",
        config: {
          mode: "pieces",
          objective: "Evaluar atención en video",
          brand: "",
          audience: "",
          eyeTracking: {
            mediaType: "video",
            durationSeconds: 10,
            facialCoding: true,
            video: {
              storage: "cloudflare_r2",
              maxDurationSeconds: 120,
              scenes: [{ id: "s1", label: "Intro", startMs: 0, endMs: 2000 }],
              aois: [],
            },
          },
        },
        assets: [],
        video: {
          assetId: studyId,
          title: "Spot Video",
          playbackUrl: "https://cdn.example.com/spot.mp4",
          maxDurationSeconds: 120,
          durationMs: 2000,
          facialCoding: true,
          scenes: [{ id: "s1", label: "Intro", startMs: 0, endMs: 2000 }],
          aois: [],
        },
      },
    });
  });

  it("valida, guarda la observación de video + 12 AUs FACS en eye_tracking_runs y agrega el estudio", async () => {
    const db = mockDatabase();
    const observation = {
      assetId: studyId,
      durationMs: 2000,
      framesTotal: 20,
      framesValid: 4,
      playbackStalls: 0,
      audioMuted: false,
      baselineFrames: 30,
      gazeSamples: [
        { t: 900, x: 0.4, y: 0.2 },
        { t: 1000, x: 0.4, y: 0.2 },
        { t: 1100, x: 0.4, y: 0.2 },
      ],
      facialSamples: [
        {
          t: 1000,
          poseValid: true,
          au01: 10,
          au02: 10,
          au04: 0,
          au06: 70,
          au07: 5,
          au09: 0,
          au10: 0,
          au12: 80,
          au14: 0,
          au15: 0,
          au24: 0,
          au26: 15,
          blink: false,
        },
      ],
    };

    const body = JSON.stringify({
      sessionId,
      quality: {
        engineId: "webeyetrack@0.0.2",
        measurementStatus: "validated",
        medianErrorDeg: 2.1,
        coverage: 1,
        fps: 30,
        validRatio: 1,
        passed: true,
        calibrationClicks: 9,
        calibrationLayout: "v5-weighted-base",
        driftChecks: [
          {
            afterAssetCount: 0,
            medianErrorDeg: 2.1,
            maxErrorDeg: 3.0,
            coverage: 1,
            fps: 30,
            validRatio: 1,
            passed: true,
          },
          {
            afterAssetCount: 1,
            medianErrorDeg: 2.2,
            maxErrorDeg: 3.1,
            coverage: 1,
            fps: 30,
            validRatio: 1,
            passed: true,
          },
        ],
      },
      observations: [observation],
    });

    const req = new NextRequest(`https://example.test/api/s/${token}/eye/complete`, {
      method: "POST",
      body,
    });
    const res = await complete(req, ctx);
    expect(res.status).toBe(200);
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: sessionId,
        study_id: studyId,
        observations: [observation],
      }),
      expect.anything(),
    );
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );

    const aggregated = aggregateVideoStudy(
      [{ sessionId, participant: "P-01", observation }],
      {
        durationMs: 2000,
        aois: [
          {
            id: "brand-moving",
            label: "Producto con Keyframes",
            startMs: 0,
            endMs: 2000,
            box: [0.1, 0.1, 0.3, 0.3],
            keyframes: [
              { tMs: 0, box: [0.1, 0.1, 0.3, 0.3] },
              { tMs: 2000, box: [0.5, 0.1, 0.7, 0.3] },
            ],
          },
        ],
        scenes: [{ id: "s1", label: "Intro", startMs: 0, endMs: 2000 }],
        binMs: 1000,
      },
      { width: 1920, height: 1080 },
    );

    expect(aggregated.count).toBe(1);
    expect(aggregated.aois[0].hitRatePct).toBe(100);
    expect(aggregated.aois[0].affectWhileLooking?.aus.au12).toBe(80);
    expect(aggregated.timeline[1].meanAus?.au12).toBe(80);
  });

  it("rechaza observaciones de video que no correspondan al assetId del estudio", async () => {
    const db = mockDatabase();
    const req = new NextRequest(`https://example.test/api/s/${token}/eye/complete`, {
      method: "POST",
      body: JSON.stringify({
        sessionId,
        quality: {
          engineId: "webeyetrack@0.0.2",
          medianErrorDeg: 2.0,
          coverage: 1,
          fps: 30,
          validRatio: 1,
          passed: true,
          calibrationClicks: 9,
          calibrationLayout: "v5-weighted-base",
        },
        observations: [
          {
            assetId: "99999999-9999-4999-8999-999999999999",
            durationMs: 2000,
            framesTotal: 20,
            framesValid: 1,
            playbackStalls: 0,
            audioMuted: false,
            baselineFrames: 30,
            gazeSamples: [{ t: 100, x: 0.5, y: 0.5 }],
            facialSamples: [],
          },
        ],
      }),
    });
    const res = await complete(req, ctx);
    expect(res.status).toBe(422);
    expect(db.upsert).not.toHaveBeenCalled();
  });
});
