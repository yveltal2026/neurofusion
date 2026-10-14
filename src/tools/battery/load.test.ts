import { describe, expect, it } from "vitest";
import { chunk } from "./load";

describe("chunk", () => {
  it("parte una lista en trozos del tamaño pedido, el último más corto", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });
  it("lista vacía → sin trozos; no modifica la original", () => {
    const original = [1, 2, 3];
    expect(chunk([], 3)).toEqual([]);
    chunk(original, 2);
    expect(original).toEqual([1, 2, 3]);
  });
});
