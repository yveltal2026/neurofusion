import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { FACE_LANDMARKER_MODEL, FACE_OPTIONS, MOBILE_VISION_WASM } from "./face-detector-config";
import type { FaceWorkerReply, FaceWorkerRequest } from "./face-detector-protocol";

const scope = self as unknown as { onmessage: ((event: MessageEvent<FaceWorkerRequest>) => void) | null; postMessage(data: FaceWorkerReply, transfer?: Transferable[]): void };
let detector: FaceLandmarker | null = null;
scope.onmessage = (event) => {
  const request = event.data;
  if (request.kind === "init") {
    void (async () => {
      const fileset = await FilesetResolver.forVisionTasks(MOBILE_VISION_WASM);
      detector = await FaceLandmarker.createFromOptions(fileset, { ...FACE_OPTIONS,
        baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "CPU" } });
      scope.postMessage({ kind: "ready" });
    })().catch((error) => scope.postMessage({ kind: "error", message: message(error) }));
    return;
  }
  try {
    if (!detector) throw new Error("El detector CPU no está preparado.");
    const from = performance.now();
    const result = detector.detectForVideo(request.frame, request.timestampMs);
    scope.postMessage({ kind: "result", id: request.id, frame: request.frame, result, detectorMs: performance.now() - from },
      [request.frame.data.buffer as ArrayBuffer]);
  } catch (error) { scope.postMessage({ kind: "error", id: request.id, message: message(error) }); }
};
function message(error: unknown) {
  return (error instanceof Error ? error.message : "Falló el detector CPU.").replace(/https?:\/\/\S+/g, "[url]").slice(0, 400);
}
