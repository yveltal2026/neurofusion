import type { GazeResult } from "webeyetrack";

// JS y WASM deben usar la misma versión. No se usa el inicializador GPU de WebEyeTrack.
export const MOBILE_VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
export const FACE_LANDMARKER_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export function needsMobileRuntime(): boolean {
  return navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Adaptador de WebEyeTrack 0.0.2: conserva BlazeGaze y cambia sólo la detección facial. */
export async function createMobileRuntime() {
  const [{ FaceLandmarker, FilesetResolver }, { WebEyeTrack }] = await Promise.all([
    import("@mediapipe/tasks-vision"), import("webeyetrack"),
  ]);
  const fileset = await FilesetResolver.forVisionTasks(MOBILE_VISION_WASM);
  const detector = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "CPU" },
    runningMode: "IMAGE", numFaces: 1,
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
  });
  const runtime = new WebEyeTrack();
  // El paquete no ofrece inyección pública de detector. Este único acceso interno está
  // aislado y probado contra 0.0.2; nunca se ejecuta su initialize() que fuerza GPU.
  const internals = runtime as unknown as {
    faceLandmarkerClient: { initialize(): Promise<void>; processFrame(frame: ImageData): Promise<ReturnType<typeof detector.detect>> };
    blazeGaze: { model?: { dispose(): void } };
  };
  const dispose = () => { detector.close(); internals.blazeGaze?.model?.dispose(); };
  try {
    if (!("faceLandmarkerClient" in runtime)) throw new Error("La versión del motor no admite el detector móvil.");
    internals.faceLandmarkerClient = {
      initialize: async () => {},
      processFrame: async (frame) => detector.detect(frame),
    };
    await runtime.initialize();
  } catch (error) {
    dispose();
    throw error;
  }
  let stopped = false;
  let pending: Promise<GazeResult> | null = null;
  return {
    async step(frame: ImageData, timestamp: number) {
      if (stopped) throw new Error("El detector móvil ya está detenido.");
      pending = runtime.step(frame, timestamp);
      try { return await pending; } finally { pending = null; }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      // No liberar WASM/tensores mientras una inferencia los está usando.
      if (pending) void pending.then(dispose, dispose);
      else dispose();
    },
  };
}

export type MobileRuntime = Awaited<ReturnType<typeof createMobileRuntime>>;
