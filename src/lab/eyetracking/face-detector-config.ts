// JS y WASM de MediaPipe deben conservar la misma versión.
export const MOBILE_VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
export const FACE_LANDMARKER_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
export const FACE_OPTIONS = { runningMode: "VIDEO" as const, numFaces: 1,
  outputFaceBlendshapes: false, outputFacialTransformationMatrixes: true };
