export type LightingStatus = "checking" | "good" | "dark" | "backlit" | "overexposed" | "unavailable";

/** Estimación conservadora de exposición del centro del rostro, no una medición de lux. */
export function assessLighting(data: Uint8ClampedArray, width: number, height: number): LightingStatus {
  let center = 0, border = 0, count = 0, edges = 0, dark = 0, bright = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (x >= width * 0.25 && x < width * 0.75 && y >= height * 0.2 && y < height * 0.8) {
      center += luminance; count++; dark += Number(luminance < 35); bright += Number(luminance > 245);
    } else { border += luminance; edges++; }
  }
  if (!count || !edges) return "unavailable";
  const mean = center / count;
  if (mean < 60 && border / edges > mean * 1.8 + 20) return "backlit";
  if (mean < 45 && dark / count > 0.65) return "dark";
  if (mean > 235 && bright / count > 0.65) return "overexposed";
  return "good";
}

export function observeLighting(video: HTMLVideoElement, onChange: (status: LightingStatus) => void, simulated = false): () => void {
  const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 48;
  const context = simulated ? null : canvas.getContext("2d", { willReadFrequently: true });
  let candidate: LightingStatus = "checking", streak = 0, published: LightingStatus = "checking";
  let active = true;
  queueMicrotask(() => { if (active) onChange("checking"); });
  const timer = setInterval(() => {
    let next: LightingStatus = "checking";
    try {
      if (simulated) next = "good";
      else if (!context) next = "unavailable";
      else if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        context.drawImage(video, 0, 0, 64, 48);
        next = assessLighting(context.getImageData(0, 0, 64, 48).data, 64, 48);
      }
    } catch { next = "unavailable"; }
    streak = next === candidate ? streak + 1 : 1; candidate = next;
    // Ignora cambios de exposición automáticos y parpadeos transitorios de la cámara.
    if (streak >= 4 && next !== published) { published = next; onChange(next); }
  }, 250);
  return () => { active = false; clearInterval(timer); };
}

export const LIGHTING_MESSAGES: Record<LightingStatus, string> = {
  checking: "Comprobando la iluminación de la cámara…",
  good: "La exposición de la cámara permite comenzar.",
  dark: "Hay poca luz en tu rostro. Muévete a un lugar más iluminado y busca luz de frente antes de calibrar.",
  backlit: "Hay contraluz: el fondo está más iluminado que tu rostro. Ponte de frente a la luz o cambia de lugar antes de calibrar.",
  overexposed: "La luz es demasiado intensa en tu rostro. Evita la luz directa y busca una iluminación frontal más uniforme.",
  unavailable: "No pudimos comprobar la iluminación de la cámara. Vuelve a iniciar la cámara para revisarla.",
};
