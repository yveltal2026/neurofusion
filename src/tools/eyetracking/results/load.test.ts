import { describe, expect, it } from "vitest";
import { joinEyeReportRuns } from "./load";
import { observation, quality } from "@/tools/reports/test-fixtures";

describe("sesiones del informe de eye tracking", () => {
  it("clasifica exclusiones, precisión limitada, baja calidad y datos incompletos sin duplicar conteos", () => {
    const sessions = [
      "ok",
      "excluded",
      "limited",
      "bad",
      "invalid",
      "missing",
      "empty",
    ].map((id) => ({ id, excluded: id === "excluded" }));
    const rows = [
      { session_id: "ok", validation: quality, observations: [observation()] },
      {
        session_id: "excluded",
        validation: { ...quality, passed: false },
        observations: [observation()],
      },
      {
        session_id: "limited",
        validation: { ...quality, measurementStatus: "limited" },
        observations: [observation()],
      },
      {
        session_id: "bad",
        validation: { ...quality, passed: false },
        observations: [observation()],
      },
      { session_id: "invalid", validation: {}, observations: [observation()] },
      { session_id: "empty", validation: quality, observations: [] },
      {
        session_id: "not-completed",
        validation: quality,
        observations: [observation()],
      },
    ];
    const result = joinEyeReportRuns(sessions, rows);
    expect(result.counts).toEqual({
      completed: 7,
      included: 1,
      excluded: 1,
      limited: 1,
      lowQuality: 1,
      invalid: 3,
    });
    expect(result.runs.map((run) => run.id)).toEqual(["ok"]);
  });
  it("no limita el informe a las últimas 100 sesiones", () => {
    const sessions = Array.from({ length: 125 }, (_, i) => ({
      id: String(i),
      excluded: false,
    }));
    const rows = sessions.map((s) => ({
      session_id: s.id,
      validation: quality,
      observations: [observation()],
    }));
    const result = joinEyeReportRuns(sessions, rows);
    expect(result.counts.completed).toBe(125);
    expect(result.runs).toHaveLength(125);
  });
});
