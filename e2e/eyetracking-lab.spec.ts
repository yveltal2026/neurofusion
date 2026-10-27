import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("el laboratorio simulado calibra, valida y exporta una sesión", async ({ page }) => {
  test.setTimeout(80_000);
  await page.goto("/lab/eyetracking?engine=fake");
  await page.evaluate(() => {
    const state = window as Window & { calibrationLeaks?: number };
    state.calibrationLeaks = 0;
    window.addEventListener("click", () => { state.calibrationLeaks = (state.calibrationLeaks ?? 0) + 1; });
  });
  await page.getByLabel("Tamaño de pantalla (pulgadas)").fill("34");
  await page.getByLabel("Formato de pantalla").selectOption("21:9");
  await page.getByLabel("Código de la persona").fill("E2E");
  await page.getByRole("button", { name: "Iniciar cámara y cargar modelos" }).click();
  await expect(page.getByRole("heading", { name: "Acomódate frente a la cámara" })).toBeVisible();
  await page.getByRole("button", { name: "Comenzar calibración" }).click();

  for (let i = 1; i <= 9; i++) {
    const dot = page.getByRole("button", { name: `Punto de calibración ${i}` });
    await expect(dot).toBeEnabled();
    await dot.click();
  }

  for (let i = 1; i <= 8; i++) {
    await expect(page.getByText(`Objetivo ${i} de 8. Solo mira el punto.`)).toBeVisible();
    const box = await page.getByTestId("validation-target").boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  }
  await expect(page.getByRole("heading", { name: "Resultados de la validación" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("eyetracking-E2E-laptop");
  const session = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(session.calibration.layout).toBe("v3-affine-fixations");
  expect(session.geometry.diagonalInches).toBe(34);
  expect(session.geometry.screenFormat).toBe("21:9");
  expect(session.verdict.pass).toBe(true);
  expect(session.summary.medianErrorPx).toBeLessThan(15);
  expect(await page.evaluate(() => (window as Window & { calibrationLeaks?: number }).calibrationLeaks)).toBe(0);
});
