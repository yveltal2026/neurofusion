// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Tabs, type TabItem } from "./tabs";

afterEach(cleanup);

const items: TabItem[] = [
  { id: "one", label: "Pestaña Uno", count: 3, content: <div>Contenido de Uno</div> },
  { id: "two", label: "Pestaña Dos", content: <div>Contenido de Dos</div> },
  { id: "three", label: "Pestaña Tres", count: 0, content: <div>Contenido de Tres</div> },
];

describe("Tabs", () => {
  it("renderiza las pestañas, badges y el primer panel por defecto", () => {
    render(<Tabs label="Prueba de pestañas" items={items} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(screen.getByText("Contenido de Uno")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("cambia de pestaña al hacer clic", async () => {
    const user = userEvent.setup();
    render(<Tabs label="Prueba de pestañas" items={items} />);
    const tabTwo = screen.getByRole("tab", { name: "Pestaña Dos" });
    await user.click(tabTwo);
    expect(tabTwo.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Contenido de Dos")).toBeTruthy();
  });

  it("soporta navegación accesible por teclado (flechas, Home y End)", async () => {
    const user = userEvent.setup();
    render(<Tabs label="Prueba de pestañas" items={items} />);
    const tabOne = screen.getByRole("tab", { name: /Pestaña Uno/ });
    tabOne.focus();
    expect(document.activeElement).toBe(tabOne);

    // Flecha derecha: va a la pestaña dos
    await user.keyboard("{ArrowRight}");
    const tabTwo = screen.getByRole("tab", { name: "Pestaña Dos" });
    expect(document.activeElement).toBe(tabTwo);
    expect(tabTwo.getAttribute("aria-selected")).toBe("true");

    // End: va a la última pestaña
    await user.keyboard("{End}");
    const tabThree = screen.getByRole("tab", { name: "Pestaña Tres" });
    expect(document.activeElement).toBe(tabThree);
    expect(tabThree.getAttribute("aria-selected")).toBe("true");

    // Home: vuelve a la primera
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(tabOne);
    expect(tabOne.getAttribute("aria-selected")).toBe("true");

    // Flecha izquierda desde la primera: cicla a la última
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(tabThree);
    expect(tabThree.getAttribute("aria-selected")).toBe("true");
  });

  it("renderiza la variante segmented con grid para ocupar todo el ancho sin scroll", () => {
    render(<Tabs label="Segmented" items={items} variant="segmented" />);
    const list = screen.getByRole("tablist", { name: "Segmented" });
    expect(list.className).toContain("grid");
    expect(list.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
  });
});
