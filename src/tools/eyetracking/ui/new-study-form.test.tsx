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

it("el formulario de webcam ofrece estímulo de imágenes o video y envía la configuración elegida", async () => {
  render(<NewEyeTrackingStudyForm projectId="project" />);
  expect(screen.getAllByRole("radio")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Nombre del estudio"), { target: { value: "Webcam" } });
  fireEvent.change(screen.getByLabelText("Objetivo"), { target: { value: "Medir atención al precio" } });
  fireEvent.change(screen.getByLabelText("Segundos por imagen"), { target: { value: "15" } });
  fireEvent.submit(screen.getByRole("button", { name: "Crear estudio de eye tracking" }).closest("form")!);
  await waitFor(() =>
    expect(createEyeTrackingStudy).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project",
        name: "Webcam",
        config: expect.objectContaining({
          eyeTracking: expect.objectContaining({
            mediaType: "image",
            durationSeconds: 15,
            facialCoding: false,
          }),
        }),
      }),
    ),
  );
  expect(await screen.findByText("Error de prueba")).toBeTruthy();
});

it("permite configurar un estudio de video con Facial Coding y escenas", async () => {
  render(<NewEyeTrackingStudyForm projectId="project" />);
  fireEvent.click(screen.getByRole("radio", { name: /Video \+ Facial Coding/i }));
  expect(screen.queryByLabelText("Segundos por imagen")).toBeNull();
  fireEvent.change(screen.getByLabelText("Nombre del estudio"), { target: { value: "Spot 30s" } });
  fireEvent.change(screen.getByLabelText("Objetivo"), { target: { value: "Evaluar hook y sonrisa" } });
  fireEvent.change(screen.getByLabelText("Duración máxima del video (s)"), { target: { value: "60" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Agregar escena" }));
  fireEvent.submit(screen.getByRole("button", { name: "Crear estudio de eye tracking" }).closest("form")!);
  await waitFor(() =>
    expect(createEyeTrackingStudy).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project",
        name: "Spot 30s",
        config: expect.objectContaining({
          eyeTracking: expect.objectContaining({
            mediaType: "video",
            facialCoding: true,
            video: expect.objectContaining({
              storage: "cloudflare_r2",
              maxDurationSeconds: 60,
              scenes: [expect.objectContaining({ label: "Escena 1", startMs: 0, endMs: 15000 })],
            }),
          }),
        }),
      }),
    ),
  );
});
