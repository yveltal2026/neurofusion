// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Tensor } from "@tensorflow/tfjs-core";
import { createAsyncGazeStep } from "./async-gaze";

beforeEach(() => {
  vi.stubGlobal("ImageData", class {
    data: Uint8ClampedArray;
    constructor(readonly width: number, readonly height: number) { this.data = new Uint8ClampedArray(width * height * 4).fill(128); }
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function fixture() {
  const tf = await import("@tensorflow/tfjs-core");
  const { WebEyeTrack } = await import("webeyetrack");
  await tf.setBackend("cpu"); await tf.ready();
  const runtime = new WebEyeTrack();
  const native = new WebEyeTrack();
  const face = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const eye of [[362, 385, 387, 263, 373, 380], [133, 158, 160, 33, 144, 153]]) {
    eye.forEach((index, i) => { face[index] = { x: [0.3, 0.4, 0.6, 0.7, 0.6, 0.4][i], y: [0.5, 0.4, 0.4, 0.5, 0.6, 0.6][i], z: 0 }; });
  }
  const detection = { faceLandmarks: [face], facialTransformationMatrixes: [{ rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }], faceBlendshapes: [] };
  const patch = new ImageData(512, 128);
  type Internal = { faceLandmarkerClient: { processFrame: () => Promise<typeof detection> }; blazeGaze: { predict: () => Tensor }; kalmanFilter: { step: (value: number[]) => number[] }; affineMatrix?: Tensor };
  const inner = runtime as unknown as Internal;
  const reference = native as unknown as Internal;
  for (const engine of [runtime, native]) {
    const own = engine as unknown as Internal;
    own.faceLandmarkerClient = { processFrame: vi.fn(async () => detection) };
    own.blazeGaze = { predict: vi.fn(() => tf.tensor2d([[0.25, -0.3]])) };
    vi.spyOn(engine, "prepareInput").mockReturnValue([patch, [0, 0, 1], [0, 0, 60]]);
  }
  const controller = new AbortController();
  const step = await createAsyncGazeStep(runtime, controller.signal);
  const frame = new ImageData(640, 640);
  return { tf, runtime, native, inner, reference, detection, face, controller, step, frame };
}

it("coincide con step real, incluido ajuste afín, filtro acumulado y lecturas cerradas/sin rostro", async () => {
  const f = await fixture();
  const count = f.tf.memory().numTensors;
  const affine = f.tf.tensor2d([[1.2, 0.1, 0.02], [-0.15, 0.85, -0.03]]);
  for (let i = 0; i < 4; i++) {
    if (i === 2) { f.inner.affineMatrix = affine; f.reference.affineMatrix = affine; }
    const expected = await f.native.step(f.frame, i / 30);
    const actual = await f.step(f.frame, i / 30);
    expect(actual.normPog).toEqual(expected.normPog);
    expect(actual.eyePatch).toBe(expected.eyePatch);
    expect(actual.headVector).toEqual(expected.headVector);
    expect(actual.faceOrigin3D).toEqual(expected.faceOrigin3D);
    expect(actual.gazeState).toBe("open");
    expect(f.runtime.latestGazeResult).toBe(actual);
  }
  const latest = f.runtime.latestGazeResult;
  for (const i of [385, 387, 373, 380]) f.face[i].y = 0.5;
  expect((await f.step(f.frame, 0.2)).discardReason).toBe("eyes-closed");
  expect((await f.native.step(f.frame, 0.2)).gazeState).toBe("closed");
  f.detection.faceLandmarks = [];
  const absent = await f.step(f.frame, 0.3);
  expect(absent.discardReason).toBe("no-face");
  expect(absent.normPog).toEqual((await f.native.step(f.frame, 0.3)).normPog);
  expect(f.runtime.latestGazeResult).toBe(latest);
  affine.dispose();
  expect(f.tf.memory().numTensors).toBe(count);
});

it("espera data asíncrona sin arraySync y cancela sin avanzar filtro ni guardar resultado tardío", async () => {
  const f = await fixture();
  const count = f.tf.memory().numTensors;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const reading = new Promise<void>((resolve) => { started = resolve; });
  let output!: Tensor;
  f.inner.blazeGaze.predict = () => {
    output = f.tf.tensor2d([[0.25, -0.3]]);
    vi.spyOn(output, "arraySync").mockImplementation(() => { throw new Error("Lectura bloqueante"); });
    const original = output.data.bind(output);
    vi.spyOn(output, "data").mockImplementation(async () => { started(); await waiting; return original(); });
    return output;
  };
  const filter = vi.spyOn(f.inner.kalmanFilter, "step");
  const pending = f.step(f.frame, 0.04);
  await reading;
  expect(filter).not.toHaveBeenCalled();
  expect(f.runtime.latestGazeResult).toBeNull();
  expect(f.tf.memory().numTensors).toBe(count + 1);
  f.controller.abort(); release();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(filter).not.toHaveBeenCalled();
  expect(output.arraySync).not.toHaveBeenCalled();
  expect(f.tf.memory().numTensors).toBe(count);
});

it("libera el tensor si falla la descarga y no contamina el filtro con coordenadas no finitas", async () => {
  const f = await fixture();
  const count = f.tf.memory().numTensors;
  f.inner.blazeGaze.predict = () => {
    const output = f.tf.tensor2d([[0.25, -0.3]]);
    vi.spyOn(output, "data").mockRejectedValue(new Error("readback failed"));
    return output;
  };
  await expect(f.step(f.frame, 0.04)).rejects.toThrow("readback failed");
  expect(f.tf.memory().numTensors).toBe(count);
  const filter = vi.spyOn(f.inner.kalmanFilter, "step");
  f.inner.blazeGaze.predict = () => f.tf.tensor2d([[NaN, 0]]);
  expect((await f.step(f.frame, 0.08)).discardReason).toBe("non-finite-gaze");
  expect(filter).not.toHaveBeenCalled();
  f.inner.blazeGaze.predict = () => f.tf.tensor2d([[0.25, -0.3]]);
  expect((await f.step(f.frame, 0.12)).normPog).toEqual((await f.native.step(f.frame, 0.12)).normPog);
  expect(f.tf.memory().numTensors).toBe(count);
});
