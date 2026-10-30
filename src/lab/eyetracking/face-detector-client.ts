import type { FaceDetection, FaceWorkerReply, FaceWorkerRequest } from "./face-detector-protocol";

/** Worker clásico: el cargador WASM oficial de MediaPipe usa importScripts(). */
export async function createFaceDetectorWorker(signal: AbortSignal) {
  if (typeof Worker === "undefined") throw new Error("El navegador no ofrece Worker.");
  const worker = new Worker(new URL("./face-detector.worker.ts", import.meta.url));
  let closed = false;
  let sequence = 0;
  const requests = new Map<number, { resolve(value: FaceDetection): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  let ready!: () => void;
  let failed!: (error: Error) => void;
  const initialized = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject; });
  const initTimer = setTimeout(() => close(new Error("El detector CPU no terminó de cargar en 25 segundos.")), 25000);
  function close(error: Error = new DOMException("Detector detenido", "AbortError")) {
    if (closed) return;
    closed = true;
    clearTimeout(initTimer);
    signal.removeEventListener("abort", abort);
    worker.terminate();
    failed(error);
    for (const request of requests.values()) { clearTimeout(request.timer); request.reject(error); }
    requests.clear();
  }
  const abort = () => close();
  signal.addEventListener("abort", abort, { once: true });
  worker.onmessage = (event: MessageEvent<FaceWorkerReply>) => {
    const reply = event.data;
    if (closed) return;
    if (reply.kind === "ready") { clearTimeout(initTimer); ready(); return; }
    if (reply.kind === "error") { close(new Error(reply.message)); return; }
    const request = requests.get(reply.id);
    if (!request) return;
    requests.delete(reply.id); clearTimeout(request.timer); request.resolve(reply);
  };
  worker.onerror = () => close(new Error("Falló el proceso de detección CPU."));
  worker.onmessageerror = () => close(new Error("No se pudo recibir el resultado de detección CPU."));
  try {
    if (signal.aborted) close();
    else worker.postMessage({ kind: "init" } satisfies FaceWorkerRequest);
    await initialized;
  } catch (error) { close(); throw error; }
  return {
    close,
    detect(frame: ImageData, timestampMs: number, transfer = true): Promise<FaceDetection> {
      if (closed) return Promise.reject(new Error("El detector CPU está detenido."));
      if (requests.size >= 2) return Promise.reject(new Error("Ya hay dos frames en proceso."));
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => close(new Error("El detector CPU dejó de responder.")), 5000);
        requests.set(id, { resolve, reject, timer });
        try { worker.postMessage({ kind: "detect", id, frame, timestampMs } satisfies FaceWorkerRequest, transfer ? [frame.data.buffer as ArrayBuffer] : []); }
        catch (error) { close(error instanceof Error ? error : new Error("No se pudo enviar el frame.")); }
      });
    },
  };
}
export type CpuFaceWorker = Awaited<ReturnType<typeof createFaceDetectorWorker>>;
