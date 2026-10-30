// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createAsyncGazeStep } from "./async-gaze";
import { selectGazeBackend } from "./gaze-backend";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("el modelo y step de WebEyeTrack reales funcionan con el backend WASM compartido sin cambiar pesos ni filtro", async () => {
  vi.stubGlobal("self", { location: new URL("http://models.test") });
  vi.stubGlobal("ImageData", class {
    data: Uint8ClampedArray;
    constructor(readonly width: number, readonly height: number) { this.data = new Uint8ClampedArray(width * height * 4).fill(128); }
  });
  const modelJson = await readFile(resolve("public/web/model.json"), "utf8");
  const weights = await readFile(resolve("public/web/group1-shard1of1.bin"));
  const root = `${resolve("public/web/tfjs-wasm/4.22.0")}/`;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).endsWith(".wasm")
    ? new Response(await readFile(resolve(root, basename(String(url)))), { headers: { "content-type": "application/wasm" } })
    : String(url).endsWith("model.json")
    ? new Response(modelJson, { headers: { "content-type": "application/json" } })
    : new Response(weights)));
  const tf = await import("@tensorflow/tfjs-core");
  const { WebEyeTrack } = await import("webeyetrack");
  await tf.setBackend("cpu"); await tf.ready();
  const runtime = new WebEyeTrack();
  const internals = runtime as unknown as { blazeGaze: { loadModel(): Promise<void>; predict: Parameters<typeof selectGazeBackend>[0]; model: { dispose(): void } }; faceLandmarkerClient: { processFrame(): Promise<unknown> } };
  await internals.blazeGaze.loadModel();
  const count = tf.memory().numTensors;
  const report = await selectGazeBackend(internals.blazeGaze.predict.bind(internals.blazeGaze), undefined, root);
  expect(report.baselineMedianMs).toBeGreaterThan(0);
  expect(report.wasmMedianMs).toBeGreaterThan(0);
  expect(report.status).not.toBe("unavailable");
  expect(tf.memory().numTensors).toBe(count);
  // Fuerza también esta ruta si el hardware de pruebas prefiere la anterior.
  await tf.setBackend("wasm"); await tf.ready();
  const face = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  for (const eye of [[362, 385, 387, 263, 373, 380], [133, 158, 160, 33, 144, 153]]) {
    for (let i = 0; i < eye.length; i++) face[eye[i]] = { x: [0.3, 0.4, 0.6, 0.7, 0.6, 0.4][i], y: [0.5, 0.4, 0.4, 0.5, 0.6, 0.6][i], z: 0 };
  }
  internals.faceLandmarkerClient = { processFrame: async () => ({ faceLandmarks: [face], faceBlendshapes: [], facialTransformationMatrixes: [] }) };
  vi.spyOn(runtime, "prepareInput").mockReturnValue([new ImageData(512, 128), [0, 0, 1], [0, 0, 60]]);
  const asyncRuntime = new WebEyeTrack();
  const asyncInternals = asyncRuntime as unknown as typeof internals;
  asyncInternals.blazeGaze = internals.blazeGaze;
  asyncInternals.faceLandmarkerClient = internals.faceLandmarkerClient;
  vi.spyOn(asyncRuntime, "prepareInput").mockImplementation(runtime.prepareInput);
  const asyncStep = await createAsyncGazeStep(asyncRuntime, new AbortController().signal);
  const result = await runtime.step(new ImageData(640, 640), 0.04);
  const candidate = await asyncStep(new ImageData(640, 640), 0.04);
  expect(candidate.normPog).toEqual(result.normPog);
  expect(asyncRuntime.latestGazeResult).toBe(candidate);
  expect(result.gazeState).toBe("open");
  expect(result.normPog.every(Number.isFinite)).toBe(true);
  expect(tf.memory().numTensors).toBe(count);
  internals.blazeGaze.model.dispose();
}, 20000);
