import { describe, expect, it } from "vitest";
import { defaultConsentText, defaultIatConfig, type IatConfig } from "../config";
import { interpretationText } from "./labels";
import {
  buildSessionViews,
  filterViews,
  rawTrialsCsv,
  sessionSummaryCsv,
  toStatsSessions,
  type ResultRow,
  type SessionRow,
} from "./views";

const config: IatConfig = {
  ...defaultIatConfig(),
  product: "café",
  conceptA: { label: "Marca A", stimuli: ["Marca A"] },
  conceptB: { label: "Marca B", stimuli: ["Marca B"] },
  dimensions: ["confianza", "premium"].map((id) => ({
    id,
    name: id,
    positiveLabel: `Pos ${id}`,
    negativeLabel: `Neg ${id}`,
    positiveWords: ["a", "b", "c", "d", "e"],
    negativeWords: ["f", "g", "h", "i", "j"],
  })),
  participant: {
    collectAge: true,
    collectGender: true,
    explicitQuestion: "?",
    extraFields: [{ id: "frecuencia", label: "F", type: "select", options: ["Diario", "Semanal"], required: false }],
  },
  texts: { consent: defaultConsentText("café"), thankYou: "ok" },
};

const session = (id: string, over: Partial<SessionRow> = {}): SessionRow => ({
  id,
  participant_ref: `p-${id}`,
  status: "completed",
  demographics: { age: 30, gender: "Mujer", frecuencia: "Diario" },
  explicit_preference: "A",
  input_mode: "keyboard",
  device_type: "desktop",
  screen_width: 1280,
  screen_height: 800,
  duplicate_flag: false,
  excluded: false,
  excluded_reason: null,
  started_at: "2026-10-01T10:00:00Z",
  completed_at: "2026-10-01T10:08:00Z",
  ...over,
});

const result = (sessionId: string, dim: number, over: Partial<ResultRow> = {}): ResultRow => ({
  session_id: sessionId,
  dimension_idx: dim,
  first_combo: "A_with_P1",
  d_score: 0.5,
  strength: "moderate",
  direction: "A",
  error_rate: 0.05,
  fast_fraction: 0,
  n_used: 100,
  n_trials: 200,
  valid: true,
  flags: [],
  ...over,
});

describe("buildSessionViews / filterViews", () => {
  const sessions = [
    session("1"),
    session("2", { device_type: "mobile", duplicate_flag: true }),
    session("3", { status: "started", completed_at: null }),
    session("4", { excluded: true }),
  ];
  const results = [
    result("1", 0), result("1", 1),
    result("2", 0), result("2", 1, { valid: false, flags: ["high_error_rate"] }),
    result("4", 0), result("4", 1),
  ];
  const views = buildSessionViews(config, sessions, results);

  it("agrupa resultados por sesión y calcula validez global", () => {
    expect(views.map((v) => v.allValid)).toEqual([true, false, null, true]);
    expect(views[2].dimensions).toEqual([null, null]);
  });

  it("filtra por estado, validez, dispositivo, duplicados y exclusión", () => {
    const ids = (f: Parameters<typeof filterViews>[1]) => filterViews(views, f).map((v) => v.id);
    expect(ids({ status: "started" })).toEqual(["3"]);
    expect(ids({ validity: "valid" })).toEqual(["1", "4"]);
    expect(ids({ validity: "invalid" })).toEqual(["2"]);
    expect(ids({ device: "mobile" })).toEqual(["2"]);
    expect(ids({ duplicates: "only" })).toEqual(["2"]);
    expect(ids({ excluded: "only" })).toEqual(["4"]);
    expect(ids({ excluded: "hide" })).toEqual(["1", "2", "3"]);
    expect(ids({})).toEqual(["1", "2", "3", "4"]);
  });

  it("toStatsSessions sólo incluye completadas y conserva exclusión, validez y segmentos", () => {
    const stats = toStatsSessions(config, views);
    expect(stats.map((s) => s.id)).toEqual(["1", "2", "4"]);
    expect(stats[1].dimensions).toEqual([{ d: 0.5, valid: true }, { d: 0.5, valid: false }]);
    expect(stats[2].excluded).toBe(true);
    expect(stats[0].segments).toEqual({ age_range: "25-34", gender: "Mujer", frecuencia: "Diario" });
    expect(stats[0].explicit).toBe("A");
  });
});

describe("CSV", () => {
  const views = buildSessionViews(config, [session("1"), session("2", { demographics: { gender: "=HYPERLINK(1)" }, explicit_preference: "B" })], [
    result("1", 0), result("1", 1, { d_score: -0.123456, strength: "slight", direction: "B", flags: ["a", "b"] }),
  ]);
  const csv = sessionSummaryCsv(config, views);
  const [header, row1, row2] = csv.replace("﻿", "").trim().split("\r\n");

  it("session_summary: encabezados esperados, sin datos identificadores", () => {
    expect(header.split(",").slice(0, 3)).toEqual(["session_ref", "status", "started_at"]);
    expect(header).toContain("frecuencia");
    expect(header).toContain("confianza_d");
    expect(header).toContain("premium_first_combo");
    for (const banned of ["device_id", "ip_hash", "user_agent"]) expect(header).not.toContain(banned);
    expect(row1.split(",").length).toBe(header.split(",").length);
  });

  it("session_summary: valores, redondeo, flags con | y etiqueta de marca preferida", () => {
    expect(row1).toContain("-0.1235,slight,B,true,a|b");
    expect(row1).toContain("Marca A"); // preferencia explícita
    expect(row2).toContain("Marca B");
    expect(row2).toContain("'=HYPERLINK(1)"); // fórmula neutralizada
    // Sesión sin resultados: columnas de dimensión vacías pero misma cantidad de columnas.
    expect(row2.split(",").length).toBe(header.split(",").length);
  });

  it("session_summary: opción múltiple en columnas 0/1 y Likert numérica", () => {
    const cfg2 = {
      ...config,
      participant: {
        ...config.participant,
        extraFields: [
          { id: "canales", label: "Dónde", type: "multiselect" as const, options: ["Tienda", "En línea"], required: false },
          { id: "valor", label: "Valor", type: "likert" as const, points: 5, required: false },
        ],
      },
    };
    const v = buildSessionViews(cfg2, [session("1", { demographics: { canales: ["En línea"], valor: 4 } })], []);
    const [h, r] = sessionSummaryCsv(cfg2, v).replace("﻿", "").trim().split("\r\n");
    const cols = h.split(",");
    const cells = r.split(",");
    expect(cells.length).toBe(cols.length);
    const at = (name: string) => cells[cols.indexOf(name)];
    expect([at("canales_tienda"), at("canales_en_linea"), at("valor")]).toEqual(["0", "1", "4"]);
  });

  it("raw_trials: una fila por ensayo con ids de dimensión", () => {
    const out = rawTrialsCsv(config, new Map([["s1", "p-1"]]), [
      { session_id: "s1", dimension_idx: 1, block: 3, trial_idx: 0, category: "P1", stimulus: "Seguro, firme", correct_side: "left", pressed_side: "right", rt_ms: 612.349, error: true },
    ]);
    const lines = out.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("session_ref,dimension_id,dimension_name,block,trial_idx,category,stimulus,correct_side,pressed_side,rt_ms,error");
    expect(lines[1]).toBe('p-1,premium,premium,3,0,P1,"Seguro, firme",left,right,612.3,true');
  });
});

describe("interpretationText", () => {
  it("describe fuerza y a quién se asocia al polo positivo", () => {
    expect(interpretationText(config, 0, result("1", 0))).toBe("Moderada · Marca A más asociada a «Pos confianza»");
    expect(interpretationText(config, 0, result("1", 0, { direction: "B", strength: "strong", d_score: -0.9 }))).toBe(
      "Fuerte · Marca B más asociada a «Pos confianza»",
    );
    expect(interpretationText(config, 0, result("1", 0, { strength: "none", direction: "none", d_score: 0.01 }))).toBe("Sin preferencia clara");
    expect(interpretationText(config, 0, null)).toBe("sin dato");
  });
});
