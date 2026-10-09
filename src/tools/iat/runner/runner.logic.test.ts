import { describe, expect, it } from "vitest";
import { classifyDevice } from "./device";
import { handlePress, startTrial } from "./trial-logic";

describe("trial-logic", () => {
  it("respuesta correcta a la primera: RT desde t0, sin error", () => {
    const r = handlePress(startTrial(1000), "left", "left", 1650);
    expect(r.outcome).toEqual({ rtMs: 650, pressed: "left", error: false });
  });

  it("error y corrección: el RT incluye el tiempo de corrección y conserva la 1.ª respuesta", () => {
    let s = startTrial(1000);
    const first = handlePress(s, "right", "left", 1400);
    expect(first.outcome).toBeNull();
    expect(first.state.showError).toBe(true);
    s = first.state;
    const second = handlePress(s, "left", "left", 1900);
    expect(second.outcome).toEqual({ rtMs: 900, pressed: "right", error: true });
    expect(second.state.showError).toBe(false);
  });

  it("varias pulsaciones incorrectas seguidas no cambian la primera respuesta", () => {
    let s = startTrial(0);
    s = handlePress(s, "right", "left", 100).state;
    s = handlePress(s, "right", "left", 200).state;
    expect(s.firstPress).toBe("right");
    expect(handlePress(s, "left", "left", 500).outcome).toEqual({ rtMs: 500, pressed: "right", error: true });
  });
});

describe("classifyDevice", () => {
  it("escritorio con ratón", () => {
    expect(classifyDevice({ maxTouchPoints: 0, coarsePointer: false, width: 1920, height: 1080 })).toMatchObject({
      inputMode: "keyboard",
      deviceType: "desktop",
    });
  });
  it("laptop táctil con trackpad (puntero principal fino) cuenta como escritorio", () => {
    expect(classifyDevice({ maxTouchPoints: 10, coarsePointer: false, width: 1440, height: 900 })).toMatchObject({
      inputMode: "keyboard",
      deviceType: "desktop",
    });
  });
  it("celular (lado corto < 600)", () => {
    expect(classifyDevice({ maxTouchPoints: 5, coarsePointer: true, width: 412, height: 915 })).toMatchObject({
      inputMode: "touch",
      deviceType: "mobile",
    });
    // Mismo celular en horizontal.
    expect(classifyDevice({ maxTouchPoints: 5, coarsePointer: true, width: 915, height: 412 }).deviceType).toBe("mobile");
  });
  it("tableta", () => {
    expect(classifyDevice({ maxTouchPoints: 5, coarsePointer: true, width: 820, height: 1180 })).toMatchObject({
      inputMode: "touch",
      deviceType: "tablet",
    });
  });
});
