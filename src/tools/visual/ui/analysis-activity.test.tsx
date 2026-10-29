// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AnalysisActivity } from "./analysis-activity";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("muestra tiempo real de espera, avisa al minuto y limpia el temporizador", () => {
  vi.useFakeTimers();
  const { unmount } = render(<AnalysisActivity />);
  expect(screen.getByText("Tiempo transcurrido: 0:00")).toBeTruthy();
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.getByText("Tiempo transcurrido: 1:00")).toBeTruthy();
  expect(screen.getByText(/La solicitud está tardando más de un minuto/)).toBeTruthy();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  render(<AnalysisActivity />);
  expect(screen.getByText("Tiempo transcurrido: 0:00")).toBeTruthy();
});
