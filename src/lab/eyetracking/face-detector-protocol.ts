import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";

export type FaceWorkerRequest = { kind: "init" } | { kind: "detect"; id: number; frame: ImageData; timestampMs: number };
export type FaceWorkerReply = { kind: "ready" } | { kind: "result"; id: number; frame: ImageData; result: FaceLandmarkerResult; detectorMs: number }
  | { kind: "error"; id?: number; message: string };
export type FaceDetection = Extract<FaceWorkerReply, { kind: "result" }>;
