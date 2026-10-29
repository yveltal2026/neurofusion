import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("el laboratorio simulado calibra, valida y exporta una sesión", async ({ page }, testInfo) => {
  test.setTimeout(130_000);
  await page.goto("/lab/eyetracking?engine=fake");
  await page.evaluate(() => {
    const state = window as Window & { calibrationLeaks?: number };
    state.calibrationLeaks = 0;
    window.addEventListener("click", () => { state.calibrationLeaks = (state.calibrationLeaks ?? 0) + 1; });
  });
  await page.getByLabel("Cómo ajustar el tamaño de pantalla").selectOption("diagonal");
  await page.getByLabel("Tamaño de pantalla (pulgadas)").fill("34");
  await page.getByLabel("Formato de pantalla").selectOption("21:9");
  await page.getByLabel("Código de la persona").fill("E2E");
  await page.getByRole("button", { name: "Iniciar cámara y cargar modelos" }).click();
  await expect(page.getByRole("heading", { name: "Acomódate frente a la cámara" })).toBeVisible();
  await page.getByRole("button", { name: "Comenzar calibración" }).click();

  for (let i = 1; i <= 18; i++) {
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
  await page.getByRole("button", { name: "Comprobar deriva" }).click();
  for (let i = 1; i <= 3; i++) {
    await expect(page.getByText(`Control de mirada ${i} de 3. Solo mira el punto.`)).toBeVisible();
    const box = await page.getByTestId("drift-target").boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  }
  await expect(page.getByRole("heading", { name: "Resultados de la validación" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain(`eyetracking-E2E-${testInfo.project.name === "mobile" ? "phone" : "laptop"}`);
  const session = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(session.calibration.layout).toBe("v5-weighted-refinement");
  expect(session.calibration.pairs).toHaveLength(18);
  expect(session.calibration.pairs.every((p: { quality: { samples: number } }) => p.quality.samples >= 10)).toBe(true);
  expect(session.calibration.fit.refinement.x.r2).toBeGreaterThan(0.95);
  expect(session.geometry.diagonalInches).toBe(34);
  expect(session.geometry.screenFormat).toBe("21:9");
  expect(session.verdict.pass).toBe(true);
  expect(session.summary.medianErrorPx).toBeLessThan(15);
  expect(session.driftChecks).toHaveLength(1);
  expect(session.driftChecks[0].passed).toBe(true);
  expect(await page.evaluate(() => (window as Window & { calibrationLeaks?: number }).calibrationLeaks)).toBe(0);
  await page.getByRole("button", { name: "Comprobar deriva" }).click();
  await page.mouse.move(5, 5);
  await expect(page.getByText(/La mirada perdió precisión/)).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole("button", { name: "Comprobar deriva" })).toBeDisabled();
});


test("ajusta pantalla sin pulgadas y coloca la cámara antes de calibrar", async ({ page }) => {
  await page.goto("/lab/eyetracking?engine=fake");
  await expect(page.getByLabel("Tamaño de pantalla (pulgadas)")).toHaveCount(0);
  await page.getByLabel("Código de la persona").fill("REFERENCE");
  const ruler = page.getByLabel("Ajustar tarjeta");
  await ruler.focus();
  await ruler.press("End");
  const referenceBox = await page.getByText("Tarjeta en vertical", { exact: true }).boundingBox();
  expect(referenceBox!.width).toBeCloseTo(Number(await ruler.inputValue()), 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("checkbox", { name: "El dibujo coincide con mi tarjeta" }).check();
  await page.getByRole("button", { name: "Iniciar cámara y cargar modelos" }).click();
  const video = page.getByTestId("camera-preview").locator("video");
  await expect(video).toBeVisible();
  const calibration = page.getByRole("button", { name: "Comenzar calibración" });
  await expect(calibration).toBeEnabled();
  const cameraBox = await video.boundingBox();
  const buttonBox = await calibration.boundingBox();
  const titleBox = await page.getByRole("heading", { name: "Acomódate frente a la cámara" }).boundingBox();
  expect(cameraBox!.y).toBeGreaterThan(titleBox!.y + titleBox!.height);
  expect(cameraBox!.y + cameraBox!.height).toBeLessThanOrEqual(buttonBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
