"use client";

import dynamic from "next/dynamic";

// Sin SSR: la prueba depende de cámara, `window` y un Worker, y su estado inicial se lee del dispositivo.
const EyeTrackingLab = dynamic(() => import("./EyeTrackingLab").then((m) => m.EyeTrackingLab), {
  ssr: false,
  loading: () => <p className="px-4 py-8 text-center text-sm text-muted">Cargando laboratorio…</p>,
});

export function EyeTrackingLabClient() {
  return <EyeTrackingLab />;
}
