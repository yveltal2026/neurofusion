// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingChecklist } from "./onboarding-checklist";

const mocks = vi.hoisted(() => ({
  completeTour: vi.fn(async () => ({ ok: true })),
  dismiss: vi.fn(async () => {}),
  reopen: vi.fn(async () => {}),
}));

vi.mock("@/lib/onboarding/actions", () => ({
  completeTourMissionAction: mocks.completeTour,
  dismissOnboardingChecklistAction: mocks.dismiss,
  reopenOnboardingChecklistAction: mocks.reopen,
}));

describe("OnboardingChecklist & GuidedTourModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("muestra el progreso del checklist y permite abrir y completar el tour guiado", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingChecklist
        completedMissions={["profile_confirmed", "first_project"]}
        tourCompletedAt={null}
        checklistDismissedAt={null}
        firstProjectId="proj-1"
      />,
    );

    expect(screen.getByText("Primeros pasos en Aesteros")).toBeTruthy();
    expect(screen.getByText("2/4 misiones")).toBeTruthy();
    expect(screen.getByText(/Duplica tus créditos · \+15 disponibles/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Ver tour guiado" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Tus investigaciones viven dentro de Proyectos")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.click(
      screen.getByRole("button", { name: "Finalizar y sumar +5 créditos" }),
    );

    expect(mocks.completeTour).toHaveBeenCalledTimes(1);
    expect(screen.getByText("3/4 misiones")).toBeTruthy();
  });

  it("permite ocultar y volver a mostrar el checklist manteniendo acceso al tour", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingChecklist
        completedMissions={["profile_confirmed"]}
        tourCompletedAt={null}
        checklistDismissedAt={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(mocks.dismiss).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Mostrar checklist" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ver tour guiado" })).toBeTruthy();
  });
});
