import { describe, expect, it } from "vitest";
import {
  participationStatus,
  participationLabel,
  INACTIVE_MS,
  ABANDONED_MS,
  type ParticipationActivity,
} from "./participation-activity";

const now = Date.parse("2026-10-29T06:00:00Z");
const session = (
  age: number,
  extra: Partial<ParticipationActivity> = {},
): ParticipationActivity => ({
  status: "started",
  started_at: new Date(now - 3 * 60 * 60_000).toISOString(),
  last_activity_at: new Date(now - age).toISOString(),
  ...extra,
});
describe("participation presence", () => {
  it("uses the last signal, not total study duration", () => {
    expect(participationStatus(session(10_000), now)).toBe("started");
  });
  it("distinguishes the exact inactivity and abandonment boundaries", () => {
    expect(participationStatus(session(INACTIVE_MS - 1), now)).toBe("started");
    expect(participationStatus(session(INACTIVE_MS), now)).toBe("inactive");
    expect(participationStatus(session(ABANDONED_MS - 1), now)).toBe(
      "inactive",
    );
    expect(participationStatus(session(ABANDONED_MS), now)).toBe("abandoned");
  });
  it("treats page exit as inactive, not an immediate abandonment", () => {
    expect(
      participationStatus(
        session(10_000, { inactive_since: new Date(now).toISOString() }),
        now,
      ),
    ).toBe("inactive");
    expect(
      participationStatus(
        session(0, {
          inactive_since: new Date(now - ABANDONED_MS).toISOString(),
        }),
        now,
      ),
    ).toBe("abandoned");
  });
  it("never changes completed or interrupted states", () => {
    expect(
      participationStatus(
        session(ABANDONED_MS * 2, { status: "completed" }),
        now,
      ),
    ).toBe("completed");
    expect(
      participationLabel(
        session(0, { status: "abandoned", abandon_reason: "inactivity" }),
        now,
      ),
    ).toBe("Abandonada por inactividad");
    expect(
      participationLabel(
        session(0, { status: "abandoned", abandon_reason: "interrupted" }),
        now,
      ),
    ).toBe("Abandonada");
  });
});
