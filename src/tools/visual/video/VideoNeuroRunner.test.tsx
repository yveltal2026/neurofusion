// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VideoNeuroRunner } from "./VideoNeuroRunner";
import type { LiveVideoReading } from "./collector";

const frame: LiveVideoReading = {
  x: 640,
  y: 360,
  gazeCapturedAt: 100,
  facialCapturedAt: 100,
  blendshapes: { mouthSmileLeft: 0.2 },
  matrixData: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
};
const props = {
  assetId: "11111111-1111-4111-8111-111111111111",
  title: "Spot",
  playbackUrl: "https://example.test/video.mp4",
  durationMs: 2000,
  aois: [],
  scenes: [],
};
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Blob(["test"]))),
  );
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
it("no acepta una línea base de cámara inmóvil/detenida y limpia su timer al salir", async () => {
  render(
    <VideoNeuroRunner
      {...props}
      latestReadingRef={{ current: { ...frame, facialCapturedAt: 0 } }}
    />,
  );
  await tick(0);
  fireEvent.click(
    screen.getByRole("button", { name: /Calibrar expresión neutra/ }),
  );
  await tick(3100);
  expect(
    screen.getByText(/No obtuvimos suficientes lecturas faciales recientes/),
  ).toBeTruthy();
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(
    screen.getByRole("button", { name: /Calibrar expresión neutra/ }),
  );
  cleanup();
  expect(vi.getTimerCount()).toBe(0);
});
it("cuenta una sola vez la misma lectura de mirada durante la reproducción", async () => {
  const complete = vi.fn();
  const current = { ...frame };
  const { container } = render(
    <VideoNeuroRunner
      {...props}
      facialCoding={false}
      latestReadingRef={{ current }}
      onComplete={complete}
    />,
  );
  await tick(100);
  const video = container.querySelector("video")!;
  let time = 0;
  Object.defineProperties(video, {
    paused: { get: () => false },
    ended: { get: () => false },
    duration: { value: 2 },
    currentTime: { get: () => time },
    videoWidth: { value: 1280 },
    videoHeight: { value: 720 },
  });
  vi.spyOn(video, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1280,
    height: 720,
  } as DOMRect);
  fireEvent.click(screen.getByRole("button", { name: "Iniciar video" }));
  for (let i = 1; i <= 10; i++) {
    time = i * 0.05;
    await tick(50);
  }
  fireEvent.ended(video);
  expect(complete).toHaveBeenCalledOnce();
  expect(complete.mock.calls[0][0].observation.gazeSamples).toHaveLength(1);
  expect(complete.mock.calls[0][0].observation.framesValid).toBe(1);
  cleanup();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
});

it("rechaza un video externo que supera el límite antes de recoger lecturas", async () => {
  const { container } = render(<VideoNeuroRunner {...props} maxDurationMs={10000} />);
  await tick(0);
  const video = container.querySelector("video")!;
  Object.defineProperty(video, "duration", { value: 20 });
  fireEvent.loadedMetadata(video);
  expect(screen.getByText(/duración del video no es compatible/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Calibrar expresión/ })).toBeNull();
});
