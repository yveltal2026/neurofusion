import { describe, expect, it } from "vitest";
import {
  GUIDED_TOUR_STEPS,
  ONBOARDING_MISSIONS,
  computeOnboardingSummary,
  missionRewardTotal,
} from "./missions";

describe("onboarding/missions", () => {
  it("suma exactamente +30 créditos extra para duplicar los 30 iniciales", () => {
    expect(missionRewardTotal()).toBe(30);
    expect(ONBOARDING_MISSIONS).toHaveLength(4);
    expect(GUIDED_TOUR_STEPS).toHaveLength(4);
  });

  it("calcula el progreso gamificado y créditos restantes", () => {
    const initial = computeOnboardingSummary(["profile_confirmed"]);
    expect(initial.completedCount).toBe(1);
    expect(initial.earnedCredits).toBe(5);
    expect(initial.remainingCredits).toBe(25);
    expect(initial.percent).toBe(25);
    expect(initial.isComplete).toBe(false);

    const done = computeOnboardingSummary([
      "profile_confirmed",
      "first_project",
      "first_study",
      "guided_tour_or_sample",
    ]);
    expect(done.completedCount).toBe(4);
    expect(done.earnedCredits).toBe(30);
    expect(done.remainingCredits).toBe(0);
    expect(done.percent).toBe(100);
    expect(done.isComplete).toBe(true);
  });
});
