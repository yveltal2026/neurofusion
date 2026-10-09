import { devices, expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Flujo completo de punta a punta contra una instancia real (Supabase configurado):
 * investigador crea proyecto y estudio con el wizard → participantes responden desde
 * escritorio y celular → candado anti-repetición → el investigador ve los datos y exporta CSV.
 *
 * Requiere un usuario existente (confirmación de correo desactivada o ya confirmado):
 *   E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e
 *
 * NOTA: esta prueba necesita credenciales reales y todavía no se ha ejecutado en CI.
 */
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

const LABELS = { A: "marca a", B: "marca b", P1: "confiable", P2: "poco confiable" } as const;

async function createStudy(page: Page): Promise<{ studyUrl: string; link: string }> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(EMAIL!);
  await page.getByLabel("Contraseña").fill(PASSWORD!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/projects");

  await page.getByLabel("Nombre del proyecto").fill(`E2E ${Date.now()}`);
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Nuevo estudio" }).click();
  await page.getByRole("link", { name: /Test de Asociación Implícita/ }).click();

  const next = () => page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Producto, servicio o categoría").fill("café de especialidad");
  await next();
  await page.getByLabel("Concepto A (nombre exacto)").fill("Marca A");
  await page.getByLabel("Concepto B (nombre exacto)").fill("Marca B");
  await next();
  await page.getByRole("button", { name: "Confiable / Poco confiable" }).click();
  await next();
  await next(); // palabras precargadas
  await page.getByText("B · Demo rápida").click();
  await next();
  await next(); // datos del participante (por defecto)
  await next(); // tema neutro
  await page.getByRole("button", { name: "Generar estudio" }).click();
  await page.waitForURL(/\/studies\/[0-9a-f-]{36}\?created=1/);

  const link = await page.getByLabel("Liga mágica del estudio").inputValue();
  expect(link).toMatch(/\/s\/[A-Za-z0-9_-]{43}$/);
  return { studyUrl: page.url().split("?")[0], link };
}

/** Responde todo el test correctamente, leyendo el lado correcto de lo que muestra la pantalla. */
async function takeTest(page: Page, link: string, mode: "keyboard" | "touch") {
  await page.goto(link);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Comenzar" }).click();
  await page.getByText("Marca A", { exact: true }).click(); // preferencia explícita
  await page.getByRole("button", { name: "Continuar" }).click();
  if (mode === "touch") {
    await page.getByText("computadora con teclado").waitFor();
    await page.getByRole("button", { name: "Continuar en este dispositivo" }).click();
  }
  await page.getByRole("button", { name: "Entendido, continuar" }).click();

  const leftSel = mode === "touch" ? '[data-testid="touch-left"]' : '[data-testid="side-left"]';
  for (let block = 0; block < 5; block++) {
    await page.getByRole("button", { name: "Comenzar" }).click();
    for (;;) {
      const stim = page.getByTestId("stimulus");
      if (!(await stim.waitFor({ timeout: 4000 }).then(() => true, () => false))) break;
      const category = (await stim.getAttribute("data-category")) as keyof typeof LABELS;
      const leftText = ((await page.locator(leftSel).textContent()) ?? "").toLowerCase();
      const side = leftText.includes(LABELS[category]) ? "left" : "right";
      await page.waitForTimeout(450);
      if (mode === "touch") await page.getByTestId(`touch-${side}`).tap();
      else await page.keyboard.press(side === "left" ? "e" : "i");
      if (await page.getByRole("button", { name: "Comenzar" }).isVisible().catch(() => false)) break;
    }
  }
  await expect(page.getByTestId("thanks")).toBeVisible({ timeout: 15_000 });
}

async function newParticipant(browser: Browser, mobile: boolean) {
  const context = await browser.newContext(mobile ? { ...devices["Pixel 7"] } : {});
  return { context, page: await context.newPage() };
}

test.describe("flujo completo", () => {
  test.skip(!EMAIL || !PASSWORD, "Define E2E_EMAIL y E2E_PASSWORD para correr este flujo contra Supabase");
  test.setTimeout(8 * 60_000);

  test("investigador → participantes (escritorio y celular) → datos, candado y CSV", async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "El flujo crea sus propios contextos de escritorio y celular");
    const { studyUrl, link } = await createStudy(page);

    // Participante 1: escritorio con teclado.
    const p1 = await newParticipant(browser, false);
    await takeTest(p1.page, link, "keyboard");

    // El mismo dispositivo (misma cookie) ya no puede repetir.
    await p1.page.goto(link);
    await expect(p1.page.getByTestId("blocked")).toContainText("Ya participaste");
    await p1.context.close();

    // Participante 2: celular con botones táctiles.
    const p2 = await newParticipant(browser, true);
    await takeTest(p2.page, link, "touch");
    await p2.context.close();

    // El investigador ve ambas sesiones completadas y puede exportar.
    await page.goto(`${studyUrl}/data`);
    await expect(page.getByText("Completadas").locator("..").getByText("2")).toBeVisible();
    await expect(page.getByRole("cell", { name: /Celular/ })).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "session_summary.csv" }).click()]);
    const csv = (await (await download.createReadStream())!.toArray()).join("");
    expect(csv).toContain("session_ref,status");
    expect(csv.trim().split("\r\n")).toHaveLength(3); // encabezado + 2 sesiones
  });
});
