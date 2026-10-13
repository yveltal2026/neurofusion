import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { imageForVision, imageMetrics, inspectImage, textContrasts } from "./image.server";

async function png(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
    .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}"><rect x="10" y="10" width="${width / 2}" height="40" fill="#000"/></svg>`), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

describe("procesamiento de imágenes (sharp)", () => {
  it("verifica el formato por contenido y calcula huella y métricas", async () => {
    const buf = await png(300, 250);
    const info = await inspectImage(buf);
    expect(info).toMatchObject({ width: 300, height: 250, mime: "image/png" });
    expect(info.sha256).toMatch(/^[0-9a-f]{64}$/);
    const m = await imageMetrics(buf);
    expect(m.negativeSpace).toBeGreaterThan(0.5);
    await expect(inspectImage(Buffer.from("no soy una imagen"))).rejects.toThrow();
  });

  it("corta capturas largas en franjas JPEG", async () => {
    const { plan, parts } = await imageForVision(await png(800, 4000));
    expect(parts.length).toBe(plan.tiles.length);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]).toMatchObject({ type: "image", mediaType: "image/jpeg" });
  });

  it("estima el contraste de una caja de texto", async () => {
    const buf = await png(300, 250);
    const [c] = await textContrasts(buf, [{ id: "A1", label: "Titular", kind: "headline", box: [0, 0, 0.6, 0.25], attention: 1, importance: 5, order: 1 }]);
    expect(c.ratio).toBeGreaterThan(15);
  });
});
