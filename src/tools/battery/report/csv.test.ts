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
  variants: [],
  exposures: [],
  metrics: [{ key: "s:nps", label: "NPS", stepId: "s" }],
  rows: [
    {
      id: "1",
      ref: "abc",
      excluded: false,
      d: { "i:c": 0.123456789 },
      exposed: {},
      metrics: { "s:nps": 9 },
    },
    {
      id: "2",
      ref: "=cmd",
      excluded: true,
      d: { "i:c": null },
      exposed: {},
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

  it("incluye una columna por variante del IAT y por paso de exposición", () => {
    const full = {
      ...report,
      variants: [{ stepId: "v", stepName: "SC café", measure: "D (SC-IAT)" }],
      exposures: [{ stepId: "x", stepName: "Anuncio" }],
      rows: [
        {
          ...report.rows[0]!,
          d: { "i:c": 0.1, "v:primary": 0.456789 },
          exposed: { x: true },
        },
        {
          ...report.rows[1]!,
          d: { "i:c": null, "v:primary": null },
          exposed: { x: false },
        },
      ],
    } as unknown as BatteryReport;
    const out = batteryReportCsv(full).replace("﻿", "").trim().split("\r\n");
    expect(out[0]).toBe(
      "participant_ref,excluded,iat_IAT café_Calidad_d,variante_SC café_D (SC-IAT),exposicion_Anuncio_vio_piezas,encuesta_NPS",
    );
    expect(out[1]).toBe("abc,false,0.1,0.4568,true,9");
    expect(out[2]).toBe("'=cmd,true,,,false,");
  });
});
