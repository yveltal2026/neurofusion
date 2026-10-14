import { describe, expect, it } from "vitest";
import { batteryLinkUrl, generateMagicToken, isPlausibleToken, magicLinkUrl } from "./magic-link";

describe("magic-link", () => {
  it("genera tokens url-safe de 43 caracteres y únicos", () => {
    const tokens = new Set(Array.from({ length: 500 }, generateMagicToken));
    expect(tokens.size).toBe(500);
    for (const t of tokens) {
      expect(t).toHaveLength(43);
      expect(isPlausibleToken(t)).toBe(true);
    }
  });

  it("rechaza tokens mal formados", () => {
    expect(isPlausibleToken("")).toBe(false);
    expect(isPlausibleToken("corto")).toBe(false);
    expect(isPlausibleToken("a".repeat(43) + "!")).toBe(false);
    expect(isPlausibleToken("a/b".padEnd(43, "x"))).toBe(false);
  });

  it("construye la URL sin barras duplicadas", () => {
    expect(magicLinkUrl("https://app.test/", "abc")).toBe("https://app.test/s/abc");
    expect(magicLinkUrl("https://app.test", "abc")).toBe("https://app.test/s/abc");
  });

  it("la liga de batería usa /b/ y la de estudio /s/, sin barras dobles", () => {
    const t = generateMagicToken();
    expect(batteryLinkUrl("https://app.example.com/", t)).toBe(`https://app.example.com/b/${t}`);
    expect(magicLinkUrl("https://app.example.com/", t)).toBe(`https://app.example.com/s/${t}`);
  });
});
