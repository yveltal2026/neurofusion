// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { FACE_LANDMARKER_MODEL, MOBILE_VISION_WASM } from "./face-detector-config";

const control = vi.hoisted(() => ({ options: vi.fn(), fileset: vi.fn(), detect: vi.fn() }));
vi.mock("@mediapipe/tasks-vision", () => ({ FaceLandmarker: { createFromOptions: control.options }, FilesetResolver: { forVisionTasks: control.fileset } }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

it("el proceso CPU usa VIDEO y devuelve los mismos píxeles/timestamp con su geometría", async () => {
  const scope = { onmessage: null as null | ((event: { data: unknown }) => void), postMessage: vi.fn() };
  const face = { faceLandmarks: [[{ x: 0.3, y: 0.4, z: 0 }]], faceBlendshapes: [], facialTransformationMatrixes: [] };
  control.fileset.mockResolvedValue({}); control.options.mockResolvedValue({ detectForVideo: control.detect }); control.detect.mockReturnValue(face);
  vi.stubGlobal("self", scope);
  await import("./face-detector.worker"); scope.onmessage!({ data: { kind: "init" } });
  await vi.dynamicImportSettled();
  expect(control.fileset).toHaveBeenCalledWith(MOBILE_VISION_WASM);
  expect(control.options).toHaveBeenCalledWith({}, expect.objectContaining({ runningMode: "VIDEO", outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true, baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "CPU" } }));
  const frame = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
  scope.onmessage!({ data: { kind: "detect", id: 7, timestampMs: 1234, frame } });
  expect(control.detect).toHaveBeenCalledWith(frame, 1234);
  expect(scope.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "result", id: 7, frame, result: face }), [frame.data.buffer]);
});
