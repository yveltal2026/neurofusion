import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  reportEligibility,
  eyeReportSnapshot,
  visualReportSnapshot,
} from "./model";
import { reportHash } from "./load";
import { reportUserPrompt, REPORT_SYSTEM_PROMPT } from "./prompt";
import { storedReportSchema, REPORT_VERSION } from "./schema";
import {
  asset,
  ASSET_ID,
  briefReport,
  eyeRecords,
  surveySource,
} from "./test-fixtures";

describe("resúmenes de informes", () => {
  it("usa todas las respuestas incluidas sin enviar textos ni referencias de participantes a la IA", () => {
    const { snapshot } = surveySource();
    expect(snapshot.aggregates.nTotal).toBe(4);
    expect(snapshot.aggregates.nIncluded).toBe(3);
    const buy = snapshot.aggregates.items.find((item) => item.id === "buy");
    expect(buy?.type === "select" && buy.options[0]!.count).toBe(2);
    const prompt = reportUserPrompt(snapshot);
    for (const secret of [
      "PRIVATE_TEXT",
      "EXCLUDED_SECRET",
      "private-session",
      "private-person",
      "access_token",
      "storage_path",
    ])
      expect(prompt).not.toContain(secret);
    expect(prompt).toContain('"type":"text","n":3');
    expect(reportEligibility(snapshot).ready).toBe(true);
  });
  it("agrega miradas por imagen sin identificadores ni lecturas crudas", () => {
    const snapshot = eyeReportSnapshot(
      "Miradas",
      "Ver el producto",
      [asset()],
      eyeRecords(),
    );
    expect(snapshot.counts).toMatchObject({
      completed: 4,
      included: 3,
      excluded: 1,
    });
    expect(snapshot.assets[0]).toMatchObject({
      id: ASSET_ID,
      participants: 3,
      meanFixations: 1,
    });
    expect(snapshot.assets[0]!.aois[0]!.viewers).toBe(2);
    expect(snapshot.assets[0]!.aois[0]!.hitRatePct).toBeCloseTo(200 / 3);
    const prompt = reportUserPrompt(snapshot);
    for (const secret of [
      "private-",
      '"samples"',
      '"sessionId"',
      '"participant"',
      "private-image.png",
    ])
      expect(prompt).not.toContain(secret);
  });
  it("calcula promedios visuales sólo con piezas analizadas y mantiene pendientes explícitas", () => {
    const pending = asset(false);
    pending.row.id = "pending";
    const snapshot = visualReportSnapshot("Piezas", "Mejorar el anuncio", [
      asset(),
      pending,
    ]);
    expect(snapshot).toMatchObject({
      total: 2,
      analyzed: 1,
      pending: 1,
      highPriorityIssues: 1,
    });
    expect(snapshot.criteria.find((c) => c.key === "clarity")?.mean).toBe(4);
    expect(snapshot.assets[1]!.analysis).toBeNull();
    expect(reportEligibility(snapshot).ready).toBe(true);
    expect(reportUserPrompt(snapshot)).not.toContain("private-image.png");
  });
  it("no convierte la falta de datos en un puntaje cero", () => {
    const snapshot = visualReportSnapshot("Piezas", "Objetivo", [asset(false)]);
    expect(snapshot.criteria.every((c) => c.mean === null)).toBe(true);
    expect(reportEligibility(snapshot)).toMatchObject({
      ready: false,
      units: 0,
    });
    const noSessions = eyeRecords();
    noSessions.runs = [];
    noSessions.counts.included = 0;
    const eye = eyeReportSnapshot("Miradas", "Objetivo", [asset()], noSessions);
    expect(eye.assets[0]!.aois[0]!.ttffMs).toBeNull();
    expect(eye.assets[0]!.aois[0]!.hitRatePct).toBeNull();
    expect(reportEligibility(eye).ready).toBe(false);
  });
  it("detecta cambios en la distribución aunque no cambie el tamaño de la muestra", () => {
    const source = surveySource();
    const hash = reportHash(source.snapshot);
    expect(reportHash(structuredClone(source.snapshot))).toBe(hash);
    const changed = structuredClone(source.snapshot);
    const buy = changed.aggregates.items[0]!;
    if (buy.type === "select") buy.options[0]!.count++;
    expect(reportHash(changed)).not.toBe(hash);
  });
  it("valida el resultado guardado y exige limitaciones y evidencia", () => {
    const result = {
      kind: "study_report",
      version: REPORT_VERSION,
      sourceKind: "survey",
      sourceHash: "a".repeat(64),
      report: briefReport,
    };
    expect(storedReportSchema.safeParse(result).success).toBe(true);
    expect(
      storedReportSchema.safeParse({
        ...result,
        report: { ...briefReport, limitations: [] },
      }).success,
    ).toBe(false);
    expect(
      storedReportSchema.safeParse({ ...result, sourceKind: "iat" }).success,
    ).toBe(false);
    expect(REPORT_SYSTEM_PROMPT).toMatch(
      /sin participantes ni eye tracking medido/,
    );
  });
});
