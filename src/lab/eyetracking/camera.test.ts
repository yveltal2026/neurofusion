// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCameraSource } from "./camera";

let video: HTMLVideoElement;
let stop: ReturnType<typeof vi.fn>;
let getUserMedia: ReturnType<typeof vi.fn>;
const drawImage = vi.fn();
const getImageData = vi.fn((x: number, y: number, width: number, height: number) => ({ width, height }) as ImageData);

beforeEach(() => {
  vi.useFakeTimers();
  video = document.createElement("video");
  stop = vi.fn();
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  vi.spyOn(video, "play").mockResolvedValue();
  vi.spyOn(video, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage, getImageData } as unknown as ReturnType<HTMLCanvasElement["getContext"]>);
  Object.defineProperties(video, {
    readyState: { configurable: true, value: 2 },
    videoWidth: { configurable: true, value: 720 },
    videoHeight: { configurable: true, value: 1280 },
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("cámara móvil", () => {
  it("espera play y reintenta si aún no hay frames decodificados", async () => {
    let playing!: () => void;
    vi.mocked(video.play).mockReturnValue(new Promise<void>((resolve) => { playing = resolve; }));
    const frame = vi.fn().mockResolvedValue(undefined);
    const source = createCameraSource(video, vi.fn());
    const starting = source.startWebcam(frame);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(32);
    expect(frame).not.toHaveBeenCalled();
    Object.defineProperty(video, "readyState", { value: 0 });
    playing(); await starting;
    await vi.advanceTimersByTimeAsync(32);
    expect(frame).not.toHaveBeenCalled();
    Object.defineProperty(video, "readyState", { value: 2 });
    await vi.advanceTimersByTimeAsync(16);
    expect(frame).toHaveBeenCalledOnce();
    expect(video.playsInline).toBe(true);
    expect(video.muted).toBe(true);
    source.stopWebcam();
  });

  it("conserva proporción vertical y sólo procesa cada frame nuevo una vez", async () => {
    const frame = vi.fn().mockResolvedValue(undefined);
    const error = vi.fn();
    const source = createCameraSource(video, error);
    await source.startWebcam(frame);
    await vi.advanceTimersByTimeAsync(48);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 360, 640);
    expect(frame).toHaveBeenCalledOnce();
    video.currentTime = 0.04;
    await vi.advanceTimersByTimeAsync(16);
    expect(frame).toHaveBeenCalledTimes(2);
    source.stopWebcam();
    video.currentTime = 0.08;
    await vi.advanceTimersByTimeAsync(100);
    expect(frame).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it("libera una cámara que abre después de cancelar el inicio", async () => {
    let opened!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(new Promise((resolve) => { opened = resolve; }));
    const source = createCameraSource(video, vi.fn());
    const starting = source.startWebcam(vi.fn());
    source.stopWebcam();
    opened({ getTracks: () => [{ stop }] });
    await starting;
    expect(stop).toHaveBeenCalledOnce();
    expect(video.play).not.toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });

  it("propaga fallos de reproducción para no dejar la interfaz esperando detección", async () => {
    const failure = new DOMException("Playback blocked", "NotAllowedError");
    vi.mocked(video.play).mockRejectedValue(failure);
    const error = vi.fn();
    const source = createCameraSource(video, error);
    await source.startWebcam(vi.fn());
    expect(error).toHaveBeenCalledWith(failure);
    source.stopWebcam();
    expect(stop).toHaveBeenCalledOnce();
  });
});
