import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/tools/**/engine/**"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
