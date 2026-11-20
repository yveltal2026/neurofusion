import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La app es casi totalmente dinámica (sesión + BD), así que no usamos Cache Components.
  experimental: {
    agentUpgrade: "security",
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
