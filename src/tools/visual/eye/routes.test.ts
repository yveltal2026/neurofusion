import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as start } from "@/app/api/s/[token]/eye/start/route";
import { POST as complete } from "@/app/api/s/[token]/eye/complete/route";

const mocks = vi.hoisted(() => ({ load: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("./participant.server", () => ({ loadEyeStudyByToken: mocks.load }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ PARTICIPANT_LOCK_SECRET: "test-only-participant-lock-secret" }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true }) }));

const sessionId = "30000000-0000-4000-8000-000000000001";
const studyId = "20000000-0000-4000-8000-000000000001";
const assetId = "40000000-0000-4000-8000-000000000001";
const token = "t".repeat(43);
const ctx = { params: Promise.resolve({ token }) };
const good = { afterAssetCount: 0, medianErrorDeg: 2, maxErrorDeg: 3, coverage: 1, fps: 30, validRatio: 1, passed: true };
const bad = { ...good, afterAssetCount: 1, medianErrorDeg: 10, maxErrorDeg: 15 };
const input = () => ({ sessionId, quality: {
  engineId: "webeyetrack@0.0.2", measurementStatus: "limited", medianErrorDeg: 2, coverage: 1, fps: 30, validRatio: 1,
  passed: true, calibrationClicks: 18, calibrationLayout: "v5-weighted-refinement", driftChecks: [good, bad],
  recovery: { interruptions: 2, recalibrations: 1, repeatedAssetIds: [assetId], checks: [bad, bad] },
}, observations: [{ assetId, durationMs: 5000, framesTotal: 0, framesValid: 0, samples: [] }] });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({ ok: true, study: { id: studyId, status: "published", closes_at: null,
    config: { eyeTracking: { durationSeconds: 5 } }, assets: [{ id: assetId }] } });
});

function database(protocol = "eye-v3") {
  const upsert = vi.fn(async () => ({ error: null }));
  const update = vi.fn();
  const rpc = vi.fn(async () => ({ data: [{ outcome: "ok", new_session_id: sessionId }], error: null }));
  mocks.admin.mockReturnValue({ rpc, from: (table: string) => {
    if (table === "eye_tracking_runs") return { upsert };
    const query = { select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: { id: sessionId, study_id: studyId, status: "started", consent_version: protocol, device_type: "desktop" }, error: null }),
      update: (patch: unknown) => { update(patch); return query; },
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [{ id: sessionId }], error: null }).then(resolve),
    };
    return query;
  } });
  return { upsert, update, rpc };
}

describe("protocolo de recuperación eye-v3", () => {
  it.each(["eye-v2", "eye-v3"])("registra %s al reclamar una sesión", async (protocol) => {
    const db = database();
    const request = new NextRequest(`https://example.test/api/s/${token}/eye/start`, { method: "POST", body: JSON.stringify({
      consent: true, protocol, device: { deviceType: "desktop", screenWidth: 1280, screenHeight: 800 },
    }) });
    expect((await start(request, ctx)).status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith("claim_session", expect.objectContaining({ p_consent_version: protocol }));
  });

  it("finaliza la participación limitada, corrige los veredictos del cliente y mantiene su calidad como inválida", async () => {
    const db = database();
    const request = new NextRequest(`https://example.test/api/s/${token}/eye/complete`, { method: "POST", body: JSON.stringify(input()) });
    expect((await complete(request, ctx)).status).toBe(200);
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ validation: expect.objectContaining({ measurementStatus: "limited", passed: false,
      driftChecks: [expect.objectContaining({ passed: true }), expect.objectContaining({ passed: false })],
      recovery: expect.objectContaining({ checks: [expect.objectContaining({ passed: false }), expect.objectContaining({ passed: false })] }),
    }) }), expect.anything());
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("mantiene la exigencia de precisión para sesiones eye-v2", async () => {
    const db = database("eye-v2");
    const request = new NextRequest(`https://example.test/api/s/${token}/eye/complete`, { method: "POST", body: JSON.stringify(input()) });
    expect((await complete(request, ctx)).status).toBe(409);
    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});
