// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { assessLighting, observeLighting } from "./lighting";

function image(center: number, edge = center) {
  const data = new Uint8ClampedArray(64 * 48 * 4);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) {
    const light = x >= 16 && x < 48 && y >= 9.6 && y < 38.4 ? center : edge;
    const i = (y * 64 + x) * 4; data.set([light, light, light, 255], i);
  }
  return data;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("distingue falta de luz, contraluz y sobreexposición sin exigir piel clara", () => {
  expect(assessLighting(image(10), 64, 48)).toBe("dark");
  expect(assessLighting(image(40, 220), 64, 48)).toBe("backlit");
  expect(assessLighting(image(255), 64, 48)).toBe("overexposed");
  expect(assessLighting(image(60), 64, 48)).toBe("good");
  expect(assessLighting(image(150), 64, 48)).toBe("good");
});

it("espera exposición sostenida y libera el muestreo al abandonar el paso", async () => {
  vi.useFakeTimers();
  let pixels = image(10);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage() {}, getImageData: () => ({ data: pixels }) } as unknown as ReturnType<HTMLCanvasElement["getContext"]>);
  const video = document.createElement("video");
  Object.defineProperties(video, { readyState: { value: 2 }, videoWidth: { value: 640 }, videoHeight: { value: 480 } });
  const change = vi.fn(); const stop = observeLighting(video, change);
  await vi.advanceTimersByTimeAsync(750);
  expect(change).not.toHaveBeenCalledWith("dark");
  await vi.advanceTimersByTimeAsync(250);
  expect(change).toHaveBeenLastCalledWith("dark");
  pixels = image(140); await vi.advanceTimersByTimeAsync(1000);
  expect(change).toHaveBeenLastCalledWith("good");
  stop(); expect(vi.getTimerCount()).toBe(0);
});
