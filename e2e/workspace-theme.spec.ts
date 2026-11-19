import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const themeSelector = "Tema de apariencia";

async function expectAppearance(page: Page, mode: "light" | "dark") {
  const workspace = page.locator("[data-workspace-theme]");
  await expect(workspace).toHaveCSS("color-scheme", mode);
  const logo = page
    .getByRole("link", { name: "Aesteros, ir a proyectos" })
    .locator("img");
  await expect
    .poll(() =>
      logo.evaluate((element) => (element as HTMLImageElement).currentSrc),
    )
    .toContain(mode === "dark" ? "-oscuro.svg" : "-claro.svg");
}

test("el tema del investigador se aplica, conserva y sigue al sistema", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    !email || !password,
    "Define E2E_EMAIL y E2E_PASSWORD para probar el espacio de trabajo",
  );
  test.setTimeout(90_000);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await page.getByLabel("Correo", { exact: true }).fill(email!);
  await page.getByLabel("Contraseña", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL("**/projects");

  const selector = page.getByRole("combobox", { name: themeSelector });
  await expect(selector).toHaveValue("system");
  await expectAppearance(page, "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expectAppearance(page, "dark");
  await selector.selectOption("light");
  await expectAppearance(page, "light");
  await page.emulateMedia({ colorScheme: "light" });
  await selector.selectOption("dark");
  await expectAppearance(page, "dark");

  await page.getByRole("link", { name: "Calculadora de muestra" }).click();
  await expect(page).toHaveURL(/\/muestra$/);
  await expect(selector).toHaveValue("dark");
  await page.reload();
  await expect(selector).toHaveValue("dark");
  await expectAppearance(page, "dark");

  const withoutScripts = await browser.newContext({
    storageState: await page.context().storageState(),
    javaScriptEnabled: false,
    colorScheme: "light",
  });
  try {
    const serverPage = await withoutScripts.newPage();
    await serverPage.goto(page.url());
    await expect(
      serverPage.getByRole("combobox", { name: themeSelector }),
    ).toHaveValue("dark");
    await expectAppearance(serverPage, "dark");
  } finally {
    await withoutScripts.close();
  }

  const widths = testInfo.project.name === "mobile" ? [390] : [1440, 768];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    await selector.selectOption("light");
    await expectAppearance(page, "light");
    await selector.selectOption("system");
    await expectAppearance(page, "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expectAppearance(page, "light");
    await selector.selectOption("dark");
    await expectAppearance(page, "dark");
    await page.keyboard.press("Tab");
    await selector.focus();
    await expect(selector).toHaveCSS("outline-style", "solid");
    expect(
      await selector.evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
    ).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`profundo-${width}.png`),
    });
  }

  await page.emulateMedia({ media: "print" });
  await expect(selector).toBeHidden();
  await expect(page.locator("[data-workspace-theme]")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator("[data-workspace-theme]")).toHaveCSS(
    "color",
    "rgb(20, 17, 12)",
  );
  await page.emulateMedia({ media: "screen", colorScheme: "dark" });
  await selector.selectOption("system");
  await page.reload();
  await expect(selector).toHaveValue("system");
  await expectAppearance(page, "dark");

  await page.goto("/s/invalid");
  await expect(page.locator("[data-workspace-theme]")).toHaveCount(0);
  await expect(selector).toHaveCount(0);
});
