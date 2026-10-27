// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NewEyeTrackingStudyForm } from "./new-study-form";
import { NewVisualStudyForm } from "@/tools/visual/ui/new-study-form";
import { createEyeTrackingStudy } from "../actions";

vi.mock("../actions", () => ({ createEyeTrackingStudy: vi.fn(async () => ({ error: "Error de prueba" })) }));
vi.mock("@/tools/visual/actions", () => ({ createVisualStudy: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("el formulario de IA ofrece sólo piezas y journey", () => {
  render(<NewVisualStudyForm projectId="project" />);
  expect(screen.getAllByRole("radio")).toHaveLength(2);
  expect(screen.queryByText(/eye tracking/i)).toBeNull();
  expect(screen.queryByLabelText("Segundos por imagen")).toBeNull();
});

it("el formulario de webcam tiene configuración propia y envía la duración elegida", async () => {
  render(<NewEyeTrackingStudyForm projectId="project" />);
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Nombre del estudio"), { target: { value: "Webcam" } });
  fireEvent.change(screen.getByLabelText("Objetivo"), { target: { value: "Medir atención al precio" } });
  fireEvent.change(screen.getByLabelText("Segundos por imagen"), { target: { value: "15" } });
  fireEvent.submit(screen.getByRole("button", { name: "Crear estudio de eye tracking" }).closest("form")!);
  await waitFor(() => expect(createEyeTrackingStudy).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project", name: "Webcam", config: expect.objectContaining({ eyeTracking: { durationSeconds: 15 } }) })));
  expect(await screen.findByText("Error de prueba")).toBeTruthy();
});
