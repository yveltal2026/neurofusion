import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La app es casi totalmente dinámica (sesión + BD), así que no usamos Cache Components.
  experimental: {
    serverActions: {
      // Modo asistido de la auditoría SEO: HTML subido (máx. 3.5 MB en total + margen multipart).
      // Las imágenes no pasan por aquí: se suben directo a Supabase Storage.
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
