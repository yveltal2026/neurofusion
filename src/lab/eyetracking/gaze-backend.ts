import type { Tensor } from "@tensorflow/tfjs-core";

const WASM_ROOT = "/web/tfjs-wasm/4.22.0/";
export type GazeBackendReport = {
  selected: string;
  baseline: string;
  baselineMedianMs: number | null;
  wasmMedianMs: number | null;
  status: "retained" | "selected-wasm" | "unavailable";
};
type Predict = (image: Tensor, head: Tensor, origin: Tensor) => Tensor;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
let selection: Promise<unknown> = Promise.resolve();

/** Compara inferencia + lectura reales antes de medir; no modifica la calibración. */
export function selectGazeBackend(predict: Predict, signal?: AbortSignal, wasmRoot = WASM_ROOT, initialize?: () => Promise<void>): Promise<GazeBackendReport> {
  const run = selection.catch(() => {}).then(async () => {
    const check = () => { if (signal?.aborted) throw new DOMException("Carga cancelada", "AbortError"); };
    check();
    // La carga de pesos también usa el motor global de TF. Un reinicio espera
    // a que termine/restaure el cambio de backend del intento anterior.
    await initialize?.();
    check();
    const tf = await import("@tensorflow/tfjs-core");
    await tf.ready();
    const baseline = tf.getBackend();
    const report: GazeBackendReport = { selected: baseline, baseline, baselineMedianMs: null, wasmMedianMs: null, status: "retained" };
    // Una selección anterior ya comprobó esta ruta en el mismo navegador.
    if (baseline === "wasm") { check(); return report; }
    const patch = new ImageData(512, 128);
    for (let i = 0; i < patch.data.length; i += 4) {
      patch.data[i] = i % 251; patch.data[i + 1] = (i + 83) % 251; patch.data[i + 2] = (i + 167) % 251; patch.data[i + 3] = 255;
    }
    const measure = async () => {
      const times: number[] = [];
      let output: number[] = [];
      for (let i = 0; i < 7; i++) {
        check();
        // Cede el hilo entre pruebas para conservar UI, cámara y cancelación.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        check();
        const from = performance.now();
        output = tf.tidy(() => {
          const image = tf.browser.fromPixels(patch).toFloat().expandDims(0).div(255);
          const result = predict(image, tf.tensor2d([[0, 0, 1]]), tf.tensor2d([[0, 0, 60]]));
          return Array.from(result.dataSync());
        });
        if (output.length !== 2 || !output.every(Number.isFinite)) throw new Error("La prueba de mirada no produjo coordenadas finitas.");
        if (i >= 2) times.push(performance.now() - from);
      }
      return { ms: median(times), output };
    };
    try {
      const reference = await measure();
      report.baselineMedianMs = reference.ms;
      const wasm = await import("@tensorflow/tfjs-backend-wasm");
      check();
      wasm.setWasmPaths(wasmRoot);
      // SIMD no exige activar aislamiento ni cambiar cabeceras de la plataforma.
      wasm.setThreadsCount(1);
      if (!await tf.setBackend("wasm")) throw new Error("WebAssembly no disponible.");
      await tf.ready();
      check();
      const candidate = await measure();
      report.wasmMedianMs = candidate.ms;
      const equivalent = candidate.output.every((value, i) => Math.abs(value - reference.output[i]) <= 0.001);
      if (equivalent && candidate.ms < reference.ms * 0.85) {
        report.selected = "wasm";
        report.status = "selected-wasm";
      }
    } catch {
      report.status = "unavailable";
    } finally {
      // También se restaura tras cancelación/error para no afectar un nuevo inicio.
      if (signal?.aborted || report.selected !== "wasm") { await tf.setBackend(baseline); await tf.ready(); }
    }
    check();
    return report;
  });
  selection = run;
  return run;
}
