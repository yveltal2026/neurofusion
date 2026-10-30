// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createFaceDetectorWorker } from "./face-detector-client";
import type { FaceWorkerReply } from "./face-detector-protocol";

class FakeWorker {
  onmessage: ((event: MessageEvent<FaceWorkerReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn(); terminate = vi.fn();
  constructor() { instances.push(this); }
  reply(data: FaceWorkerReply) { this.onmessage?.({ data } as MessageEvent<FaceWorkerReply>); }
}
const instances: FakeWorker[] = [];
beforeEach(() => { vi.useFakeTimers(); instances.length = 0; vi.stubGlobal("Worker", FakeWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const pixels = () => ({ width: 2, height: 2, data: new Uint8ClampedArray(16) }) as ImageData;
const result = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] };

it("transfiere cada buffer, asocia resultados por ID y no acepta más de dos en proceso", async () => {
  const starting = createFaceDetectorWorker(new AbortController().signal);
  const worker = instances[0]; worker.reply({ kind: "ready" });
  const client = await starting;
  const a = pixels(), b = pixels();
  const first = client.detect(a, 40), second = client.detect(b, 80);
  await expect(client.detect(pixels(), 120)).rejects.toThrow("dos frames");
  expect(worker.postMessage).toHaveBeenNthCalledWith(2, { kind: "detect", id: 1, frame: a, timestampMs: 40 }, [a.data.buffer]);
  worker.reply({ kind: "result", id: 2, frame: b, result, detectorMs: 47 });
  expect(await second).toMatchObject({ id: 2, frame: b });
  worker.reply({ kind: "result", id: 1, frame: a, result, detectorMs: 47 });
  expect(await first).toMatchObject({ id: 1, frame: a });
  client.close(); client.close(); expect(worker.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("permite clonar el primer frame que aún necesita el step original", async () => {
  const starting = createFaceDetectorWorker(new AbortController().signal);
  const worker = instances[0]; worker.reply({ kind: "ready" }); const client = await starting;
  const frame = pixels(); const pending = client.detect(frame, 40, false);
  expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ frame }), []);
  worker.reply({ kind: "result", id: 1, frame, result, detectorMs: 47 }); await pending; client.close();
});

it("aborta la carga y termina el worker sin aceptar una inicialización tardía", async () => {
  const controller = new AbortController();
  const starting = createFaceDetectorWorker(controller.signal);
  const rejected = expect(starting).rejects.toMatchObject({ name: "AbortError" });
  controller.abort(); instances[0].reply({ kind: "ready" }); await rejected;
  expect(instances[0].terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});

it.each(["timeout", "error", "cancel"])("libera peticiones y timers ante %s", async (failure) => {
  const controller = new AbortController();
  const starting = createFaceDetectorWorker(controller.signal);
  const worker = instances[0]; worker.reply({ kind: "ready" }); const client = await starting;
  const completed = Promise.allSettled([client.detect(pixels(), 40), client.detect(pixels(), 80)]);
  if (failure === "timeout") await vi.advanceTimersByTimeAsync(5000);
  else if (failure === "error") worker.onerror!();
  else controller.abort();
  expect(await completed).toEqual([expect.objectContaining({ status: "rejected" }), expect.objectContaining({ status: "rejected" })]);
  expect(worker.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
