import { describe, expect, it } from "vitest";
import {
  CREDIT_COSTS,
  DEMO_INITIAL_CREDITS,
  ONBOARDING_TOTAL_BONUS_CREDITS,
  canCreateProjectUnderLimits,
  canCreateStudyUnderLimits,
  getOffersForAudience,
  getPlanDefinition,
  isAcademicAudience,
} from "./quotas";

describe("plans/quotas", () => {
  it("arranca DEMO con 30 créditos y tope de 1 proyecto, 3 estudios y 15 respuestas", () => {
    const demo = getPlanDefinition("demo");
    expect(DEMO_INITIAL_CREDITS).toBe(30);
    expect(ONBOARDING_TOTAL_BONUS_CREDITS).toBe(30);
    expect(demo.limits.maxProjects).toBe(1);
    expect(demo.limits.maxStudies).toBe(3);
    expect(demo.limits.maxResponsesPerStudy).toBe(15);
  });

  it("evalúa topes estructurales correctamente", () => {
    const demoLimits = getPlanDefinition("demo").limits;
    expect(canCreateProjectUnderLimits(demoLimits, 0)).toBe(true);
    expect(canCreateProjectUnderLimits(demoLimits, 1)).toBe(false);
    expect(canCreateStudyUnderLimits(demoLimits, 2)).toBe(true);
    expect(canCreateStudyUnderLimits(demoLimits, 3)).toBe(false);

    const enterpriseLimits = getPlanDefinition("enterprise").limits;
    expect(canCreateProjectUnderLimits(enterpriseLimits, 500)).toBe(true);
    expect(canCreateStudyUnderLimits(enterpriseLimits, 500)).toBe(true);
  });

  it("prioriza ofertas académicas para docente/estudiante y comerciales para agencia/investigador", () => {
    expect(isAcademicAudience("teacher")).toBe(true);
    expect(isAcademicAudience("student")).toBe(true);
    expect(isAcademicAudience("agency_company")).toBe(false);

    const teacherOffers = getOffersForAudience("teacher");
    expect(teacherOffers.primary.every((o) => o.audienceTrack === "academic")).toBe(true);
    expect(teacherOffers.primary.map((o) => o.id)).toContain("academic_teacher");

    const agencyOffers = getOffersForAudience("agency_company");
    expect(agencyOffers.primary.every((o) => o.audienceTrack === "commercial")).toBe(true);
    expect(agencyOffers.primary.map((o) => o.id)).toContain("agency_team");
  });

  it("define costos positivos para todas las acciones intensivas", () => {
    for (const item of Object.values(CREDIT_COSTS)) {
      expect(item.cost).toBeGreaterThan(0);
    }
  });
});
