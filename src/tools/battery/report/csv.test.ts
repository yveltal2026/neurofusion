import { describe, expect, it } from "vitest";
import { batteryReportCsv } from "./csv";
import type { BatteryReport } from "./report";

const report = {
  iat: [
    {
      stepId: "i",
      stepName: "IAT café",
      dimensionId: "c",
      dimensionName: "Calidad",
    },
  ],
  metrics: [{ key: "s:nps", label: "NPS", stepId: "s" }],
  rows: [
    {
      id: "1",
      ref: "abc",
      excluded: false,
      d: { "i:c": 0.123456789 },
      metrics: { "s:nps": 9 },
    },
    {
      id: "2",
      ref: "=cmd",
      excluded: true,
      d: { "i:c": null },
      metrics: { "s:nps": null },
    },
  ],
} as unknown as BatteryReport;

describe("CSV del informe integrado", () => {
  const lines = batteryReportCsv(report).replace("﻿", "").trim().split("\r\n");

  it("encabezados: código, exclusión, una columna por dimensión y por métrica", () => {
    expect(lines[0]).toBe(
      "participant_ref,excluded,iat_IAT café_Calidad_d,encuesta_NPS",
    );
  });
  it("redondea D a 4 decimales y deja vacío lo que no hay", () => {
    expect(lines[1]).toBe("abc,false,0.1235,9");
    expect(lines[2]).toBe("'=cmd,true,,");
  });
  it("neutraliza fórmulas en el código de participante", () => {
    expect(lines[2]!.startsWith("'=")).toBe(true);
  });
  it("no incluye datos de dispositivo ni IP", () => {
    expect(lines[0]).not.toMatch(/\bip\b|device|user_agent/i);
  });
});
