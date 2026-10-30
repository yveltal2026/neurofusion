export type LoadingStep = "checking-model" | "checking-downloads" | "loading-code" | "loading-detector" | "loading-gaze" | "starting-camera" | "waiting-frame";

export const LOADING_LABELS: Record<LoadingStep, string> = {
  "checking-model": "Comprobando los archivos del modelo…",
  "checking-downloads": "Comprobando la conexión para descargar los modelos…",
  "loading-code": "Preparando el detector…",
  "loading-detector": "Descargando y preparando el detector de rostro…",
  "loading-gaze": "Cargando el modelo de mirada…",
  "starting-camera": "Abriendo la cámara. Acepta el permiso del navegador si aparece…",
  "waiting-frame": "La cámara está lista. Esperando la primera lectura…",
};

export const STARTUP_TIMEOUT_MS = 90_000;
