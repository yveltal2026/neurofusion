import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("escribe encabezado, filas, BOM y CRLF", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("﻿a,b\r\n1,x\r\n");
  });
  it("escapa comas, comillas y saltos de línea", () => {
    expect(toCsv(["t"], [['di "hola", ok'], ["l1\nl2"]])).toBe('﻿t\r\n"di ""hola"", ok"\r\n"l1\nl2"\r\n');
  });
  it("neutraliza fórmulas en texto pero no en números", () => {
    const out = toCsv(["v"], [["=1+1"], ["+cmd"], ["-x"], ["@SUM(A1)"], [-0.4], ["normal"]]);
    expect(out).toContain("\r\n'=1+1\r\n");
    expect(out).toContain("\r\n'+cmd\r\n");
    expect(out).toContain("\r\n'-x\r\n");
    expect(out).toContain("\r\n'@SUM(A1)\r\n");
    expect(out).toContain("\r\n-0.4\r\n");
  });
  it("vacíos, booleanos y no finitos", () => {
    expect(toCsv(["a", "b", "c", "d"], [[null, undefined, true, Number.NaN]])).toBe("﻿a,b,c,d\r\n,,true,\r\n");
  });
});
