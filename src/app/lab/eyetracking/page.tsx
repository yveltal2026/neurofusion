import type { Metadata } from "next";
import { EyeTrackingLabClient } from "@/lab/eyetracking/EyeTrackingLabClient";

// Spike interno (rama spike/eyetracking): pública para poder abrirla desde celulares sin iniciar sesión,
// pero fuera de índices. No guarda nada en servidor.
export const metadata: Metadata = {
  title: "Laboratorio · Eye tracking",
  robots: { index: false, follow: false },
};

export default function EyeTrackingLabPage() {
  return <EyeTrackingLabClient />;
}
