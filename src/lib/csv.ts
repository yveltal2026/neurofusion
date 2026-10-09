/**
 * CSV seguro para Excel/Sheets:
 *  - Escapa comillas, comas y saltos de línea (RFC 4180).
 *  - Neutraliza "inyección de fórmulas": celdas de TEXTO que empiezan con = + - @ (o tab/CR)
 *    se prefijan con una comilla simple para que no se ejecuten al abrir el archivo.
 *    Los números se escriben tal cual (un -0.4 es un número, no una fórmula).
 *  - Prefijo BOM UTF-8 para que Excel respete los acentos.
 */
export type CsvCell = string | number | boolean | null | undefined;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
