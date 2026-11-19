// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VideoStudyRunner } from "./VideoStudyRunner";
import type { EyeParticipantStudy } from "../eye/participant.server";
import { completionAllowed } from "../eye/schema";
const control = vi.hoisted(() => ({
  light: "good" as import("@/lab/eyetracking/lighting").LightingStatus,
  stopped: vi.fn(),
  failure: null as null | ((e: Error) => void),
  completed: null as null | { quality: import("../eye/schema").EyeQuality },
  starts: 0,
}));
vi.mock("@/lab/eyetracking/engine", () => ({
  checkModelAssets: vi.fn(),
  checkCdnReachable: vi.fn(),
  createWebEyeTrackEngine: () => {
    let timer: ReturnType<typeof setInterval>;
    return {
      start: async (
        _video: unknown,
        onFrame: (f: unknown) => void,
        onError: (e: Error) => void,
      ) => {
        control.failure = onError;
        timer = setInterval(() => {
          const dot = document.querySelector<HTMLElement>(
            'button[aria-label^="Punto de calibración"], [data-testid="video-validation-target"], [data-testid="video-drift-target"]',
          );
          const offset = dot?.tagName === "BUTTON" ? 18 : 14;
          onFrame({
            t: performance.now(),
            x: dot
              ? parseFloat(dot.style.left) + offset
              : window.innerWidth / 2,
            y: dot
              ? parseFloat(dot.style.top) + offset
              : window.innerHeight / 2,
            faceDetected: true,
            inferenceMs: 10,
          });
        }, 25);
        return { readyMs: 1 };
      },
      stop: () => {
        clearInterval(timer);
        control.stopped();
      },
    };
  },
}));
vi.mock("@/lab/eyetracking/lighting", async (original) => ({
  ...(await original<typeof import("@/lab/eyetracking/lighting")>()),
  observeLighting: (
    _video: unknown,
    callback: (s: import("@/lab/eyetracking/lighting").LightingStatus) => void,
  ) => {
    const timer = setTimeout(() => callback(control.light), 0);
    return () => clearTimeout(timer);
  },
}));
vi.mock("./VideoNeuroRunner", () => ({
  VideoNeuroRunner: ({
    onComplete,
  }: {
    onComplete: (value: unknown) => void;
  }) => (
    <button
      onClick={() =>
        onComplete({
          observation: {
            assetId: study.id,
            durationMs: 2000,
            framesTotal: 40,
            framesValid: 40,
            gazeSamples: [{ t: 100, x: 0.5, y: 0.5 }],
            facialSamples: [],
            baselineFrames: 0,
            audioMuted: false,
            playbackStalls: 0,
          },
        })
      }
    >
      Finalizar video simulado
    </button>
  ),
}));
const study = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Spot",
  status: "published",
  config: {
    mode: "pieces",
    objective: "Atención",
    brand: "",
    audience: "",
    eyeTracking: { durationSeconds: 10, mediaType: "video" },
  },
  assets: [],
  closes_at: null,
  duplicate_policy: "none",
  video: {
    assetId: "11111111-1111-4111-8111-111111111111",
    title: "Spot",
    playbackUrl: "https://example.test/video.mp4",
    durationMs: 2000,
    maxDurationSeconds: 120,
    facialCoding: false,
    aois: [],
    scenes: [],
  },
} satisfies EyeParticipantStudy;
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "performance",
    ],
  });
  Object.defineProperty(window.screen, "width", {
    value: 1280,
    configurable: true,
  });
  Object.defineProperty(window.screen, "height", {
    value: 800,
    configurable: true,
  });
  control.light = "good";
  control.stopped.mockClear();
  control.completed = null;
  control.starts = 0;
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith("/start")) {
        control.starts++;
        return Response.json({
          sessionId: "33333333-3333-4333-8333-333333333333",
        });
      }
      control.completed = JSON.parse(options.body as string);
      return Response.json({ ok: true });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}
async function setup() {
  render(
    <VideoStudyRunner token={"t".repeat(43)} study={study} preview={false} />,
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Activar cámara y calibrar",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /El dibujo coincide/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Acepto activar/ }));
  click("Activar cámara y calibrar");
  await tick(1);
}
it("calibra 18 puntos, valida, comprueba deriva y guarda una sola sesión de video", async () => {
  await setup();
  for (let i = 1; i <= 18; i++) {
    await tick(1200);
    click(`Punto de calibración ${i}`);
    await tick(1100);
  }
  for (let i = 0; i < 8; i++) await tick(2400);
  for (let i = 0; i < 3; i++) await tick(2000);
  expect(
    screen.getByRole("button", { name: "Finalizar video simulado" }),
  ).toBeTruthy();
  click("Finalizar video simulado");
  for (let i = 0; i < 3; i++) await tick(2000);
  expect(
    screen.getByRole("heading", { name: /participación se guardó/ }),
  ).toBeTruthy();
  expect(control.starts).toBe(1);
  expect(control.completed!.quality.calibrationClicks).toBe(18);
  expect(
    control.completed!.quality.driftChecks!.map((c) => c.afterAssetCount),
  ).toEqual([0, 1]);
  expect(
    completionAllowed(control.completed!.quality, "desktop", 1, "eye-v3"),
  ).toBe(true);
  expect(control.stopped).toHaveBeenCalled();
});
it("cancela capturas pendientes al ocultar la pestaña y no inicia ni guarda tarde", async () => {
  await setup();
  await tick(1200);
  click("Punto de calibración 1");
  Object.defineProperty(document, "hidden", {
    value: true,
    configurable: true,
  });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await tick(10_000);
  expect(screen.getByText(/La pantalla o la pestaña cambió/)).toBeTruthy();
  expect(control.starts).toBe(0);
  expect(control.completed).toBeNull();
  Object.defineProperty(document, "hidden", {
    value: false,
    configurable: true,
  });
});

it("avisa de poca luz antes de presentar los puntos de calibración", async () => {
  render(
    <VideoStudyRunner token={"t".repeat(43)} study={study} preview={false} />,
  );
  control.light = "dark";
  fireEvent.click(screen.getByRole("checkbox", { name: /El dibujo coincide/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Acepto activar/ }));
  click("Activar cámara y calibrar");
  await tick(1);
  expect(screen.getByText(/Hay poca luz/)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Punto de calibración 1" }),
  ).toBeNull();
  expect(control.starts).toBe(0);
});
