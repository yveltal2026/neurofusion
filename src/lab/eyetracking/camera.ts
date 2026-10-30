/** Transporte de frames para WebEyeTrack; mantiene la proporción real de la cámara frontal. */
export function createCameraSource(video: HTMLVideoElement, onError: (error: unknown) => void, options: { square?: boolean } = {}) {
  let active = false;
  let stream: MediaStream | null = null;
  let animation = 0;
  const captureTimes: number[] = [];
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  return {
    diagnostics() { return { samples: captureTimes.length, meanCaptureMs: captureTimes.length ? captureTimes.reduce((a, b) => a + b, 0) / captureTimes.length : null }; },
    async startWebcam(callback?: (frame: ImageData, timestamp: number) => Promise<void>) {
      active = true;
      try {
        // iOS exige estos atributos antes de asignar el stream y llamar a play().
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        const opened = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
          audio: false,
        });
        if (!active) { opened.getTracks().forEach((track) => track.stop()); return; }
        stream = opened;
        video.srcObject = stream;
        await video.play();
        if (!active) return;
        if (!context) throw new Error("No se pudo preparar el video de la cámara.");
        let lastTime = -1;
        const next = async () => {
          if (!active) return;
          try {
            // loadeddata puede dispararse antes de que play() termine en móviles.
            // Un frame aún no decodificado se reintenta; no mata el bucle.
            if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && video.currentTime !== lastTime) {
              lastTime = video.currentTime;
              const captureFrom = performance.now();
              const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
              const width = Math.max(1, Math.round(video.videoWidth * scale));
              const height = Math.max(1, Math.round(video.videoHeight * scale));
              // WebEyeTrack calcula la apertura ocular en coordenadas normalizadas sin
              // corregir aspecto. Un frame cuadrado evita declarar cerrados ojos abiertos
              // en vídeo vertical, conservando la imagen sin estirarla ni recortarla.
              const outputWidth = options.square ? Math.max(width, height) : width;
              const outputHeight = options.square ? outputWidth : height;
              if (canvas.width !== outputWidth || canvas.height !== outputHeight) { canvas.width = outputWidth; canvas.height = outputHeight; }
              if (options.square) { context.fillStyle = "black"; context.fillRect(0, 0, outputWidth, outputHeight); }
              context.drawImage(video, (outputWidth - width) / 2, (outputHeight - height) / 2, width, height);
              const pixels = context.getImageData(0, 0, outputWidth, outputHeight);
              captureTimes.push(performance.now() - captureFrom);
              if (captureTimes.length > 120) captureTimes.shift();
              await callback?.(pixels, lastTime);
            }
            if (active) animation = requestAnimationFrame(() => void next());
          } catch (error) {
            if (active) { active = false; onError(error); }
          }
        };
        animation = requestAnimationFrame(() => void next());
      } catch (error) {
        if (active) { active = false; onError(error); }
      }
    },
    stopWebcam() {
      active = false;
      cancelAnimationFrame(animation);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      video.pause();
      video.srcObject = null;
    },
  };
}
