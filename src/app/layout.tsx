import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeuroFusion · Estudios de neuromarketing",
  description:
    "Plataforma para diseñar, aplicar y analizar estudios de neuromarketing, empezando por el Test de Asociación Implícita (IAT).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
