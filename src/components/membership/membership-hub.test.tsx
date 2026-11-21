// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MembershipHub } from "./membership-hub";
import type { OrgBillingSummary } from "@/lib/plans/server";

vi.mock("@/app/(app)/membresia/actions", () => ({
  submitMembershipRequestAction: vi.fn(async () => ({
    ok: true,
    message: "Solicitud registrada.",
  })),
  redeemActivationCodeAction: vi.fn(async () => ({
    ok: true,
    message: "Código aplicado.",
  })),
}));

function makeBilling(
  audienceSegment: OrgBillingSummary["audienceSegment"],
): OrgBillingSummary {
  return {
    orgId: "org-1",
    orgName: "Org Test",
    planTier: "demo",
    planName: "DEMO",
    planBadge: "DEMO",
    creditBalance: 60,
    audienceSegment,
    declaredOrganization: "Mi Org",
    limits: { maxProjects: 1, maxStudies: 3, maxResponsesPerStudy: 15 },
    usage: { projectsCount: 1, studiesCount: 2 },
  };
}

describe("MembershipHub", () => {
  afterEach(() => {
    cleanup();
  });

  it("adapta planes y formulario para perfil docente (académico)", () => {
    render(
      <MembershipHub
        billing={makeBilling("teacher")}
        userEmail="profe@universidad.edu"
        ledger={[
          {
            id: "l-1",
            org_id: "org-1",
            user_id: "u-1",
            delta: 30,
            event_type: "initial_demo_grant",
            description: "Créditos iniciales de bienvenida DEMO",
            reference_id: null,
            idempotency_key: "initial_demo_grant",
            created_at: "2026-11-20T12:00:00Z",
          },
        ]}
        requests={[]}
      />,
    );

    expect(screen.getByText("Perfil registrado: Docente / Profesor")).toBeTruthy();
    expect(screen.getByText("Opciones académicas para tu perfil")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Licencia Docente / Aula" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Solicitar licencia o verificación académica" })).toBeTruthy();
    expect(screen.getByText("+30")).toBeTruthy();
  });

  it("adapta planes comerciales para agencia/empresa y permite alternar vista", async () => {
    const user = userEvent.setup();
    render(
      <MembershipHub
        billing={makeBilling("agency_company")}
        userEmail="team@agencia.com"
        ledger={[]}
        requests={[]}
      />,
    );

    expect(screen.getByText("Perfil registrado: Agencia / Marca / Empresa")).toBeTruthy();
    expect(screen.getByText("Planes y crecimiento para tu equipo")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Plan Pro Investigador" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Plan Agencia / Marca" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Ver opciones académicas" }));
    expect(screen.getByRole("heading", { name: "Licencia Docente / Aula" })).toBeTruthy();
  });
});
