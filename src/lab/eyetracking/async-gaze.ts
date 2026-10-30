import type { Tensor } from "@tensorflow/tfjs-core";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import type { GazeResult, WebEyeTrack } from "webeyetrack";

export type GazeDiscardReason = "no-face" | "eyes-closed" | "invalid-eye-region" | "non-finite-gaze";
export type AsyncGazeResult = GazeResult & { discardReason?: GazeDiscardReason };

// Contrato privado fijado a WebEyeTrack 0.0.2 y contrastado con su step real.
type Internals = {
  faceLandmarkerClient: { processFrame(frame: ImageData): Promise<FaceLandmarkerResult> };
  blazeGaze: { predict(image: Tensor, head: Tensor, origin: Tensor): Tensor };
  affineMatrix?: Tensor;
  kalmanFilter: { step(point: number[]): number[] };
};

function eyeClosed(face: FaceLandmarkerResult["faceLandmarks"][number], indices: number[]) {
  const [a, b, c, d, e, f] = indices.map((i) => face[i]);
  const distance = (p: typeof a, q: typeof a) => Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2);
  return (distance(b, f) + distance(c, e)) / (2 * distance(a, d)) < 0.2;
}

/** Mismos pesos, preparación, umbral EAR, ajuste y filtro; lectura GPU sin arraySync. */
export async function createAsyncGazeStep(runtime: WebEyeTrack, signal: AbortSignal) {
  const tf = await import("@tensorflow/tfjs-core");
  const internals = runtime as unknown as Internals;
  const check = () => { if (signal.aborted) throw new DOMException("Lectura cancelada", "AbortError"); };
  return async (frame: ImageData, timestamp: number): Promise<AsyncGazeResult> => {
    check();
    const from = performance.now();
    const detection = await internals.faceLandmarkerClient.processFrame(frame);
    check();
    const detectedAt = performance.now();
    const face = detection.faceLandmarks[0];
    const [eyePatch, headVector, faceOrigin3D] = face ? runtime.prepareInput(frame, detection) : [new ImageData(1, 1), [0, 0, 0], [0, 0, 0]];
    const preparedAt = performance.now();
    const closed = !face || eyeClosed(face, [362, 385, 387, 263, 373, 380]) || eyeClosed(face, [133, 158, 160, 33, 144, 153]);
    const result: AsyncGazeResult = {
      facialLandmarks: face ?? [], faceRt: detection.facialTransformationMatrixes[0] ?? { rows: 0, columns: 0, data: [] },
      faceBlendshapes: detection.faceBlendshapes, eyePatch, headVector, faceOrigin3D,
      metric_transform: { rows: 3, columns: 3, data: [1, 0, 0, 1, 0, 0, 1, 0, 0] },
      gazeState: closed ? "closed" : "open", normPog: [0, 0], timestamp,
      durations: { faceLandmarker: detectedAt - from, prepareInput: preparedAt - detectedAt, blazeGaze: 0, kalmanFilter: 0, readback: 0, filter: 0, total: preparedAt - from },
    };
    if (closed) { result.discardReason = face ? "eyes-closed" : "no-face"; return result; }

    const output = tf.tidy(() => {
      const image = tf.browser.fromPixels(eyePatch).toFloat().expandDims(0).div(255);
      let prediction = internals.blazeGaze.predict(image, tf.tensor2d(headVector, [1, 3]), tf.tensor2d(faceOrigin3D, [1, 3]));
      if (internals.affineMatrix) {
        const points = prediction.reshape([-1, 2]);
        prediction = tf.matMul(tf.concat([points, tf.ones([points.shape[0], 1])], 1), internals.affineMatrix.transpose()).reshape(prediction.shape);
      }
      if (prediction.size !== 2) throw new Error("BlazeGaze no devolvió dos coordenadas.");
      return prediction;
    });
    const predictedAt = performance.now();
    let values: number[];
    // Mantener el tensor vivo hasta finalizar la descarga; tidy no admite promesas.
    try { values = Array.from(await output.data()); } finally { output.dispose(); }
    check();
    const readAt = performance.now();
    // Una lectura no finita no debe contaminar el estado del filtro siguiente.
    if (values.every(Number.isFinite)) {
      result.normPog = internals.kalmanFilter.step(values).map((v) => Math.max(-0.5, Math.min(0.5, v)));
    } else { result.normPog = [NaN, NaN]; result.discardReason = "non-finite-gaze"; }
    const filteredAt = performance.now();
    result.durations = { ...result.durations, blazeGaze: predictedAt - preparedAt,
      readback: readAt - predictedAt, filter: filteredAt - readAt, kalmanFilter: filteredAt - predictedAt, total: filteredAt - from };
    if (result.normPog.every(Number.isFinite)) runtime.latestGazeResult = result;
    else result.discardReason = "non-finite-gaze";
    return result;
  };
}
