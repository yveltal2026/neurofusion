import { describe, expect, it } from "vitest";
import { demoConfig } from "@/tools/iat/demo";
import { DEFAULT_THANK_YOU, defaultConsentText } from "@/tools/survey/engine";
import { buildBattery, toStepInfos, type StudyForBattery } from "./builder";
import { defaultBatteryConsent, DEFAULT_BATTERY_THANK_YOU } from "./engine/config";

const P = "10000000-0000-4000-8000-000000000001";
const ID = (n: number) => `20000000-0000-4000-8000-00000000000${n}`;
const survey = {
  version: 1,
  title: "E",
  texts: { consent: defaultConsentText("E"), thankYou: DEFAULT_THANK_YOU },
  blocks: [{ kind: "instrument", id: "nps", instrumentId: "nps", required: true }],
};

const studies: StudyForBattery[] = [
  { id: ID(1), project_id: P, tool_type: "iat", name: "IAT", status: "published", config: demoConfig() },
  { id: ID(2), project_id: P, tool_type: "survey", name: "Encuesta", status: "published", config: survey },
  { id: ID(3), project_id: P, tool_type: "survey", name: "Borrador", status: "draft", config: survey },
  { id: ID(4), project_id: P, tool_type: "seo", name: "SEO", status: "draft", config: {} },
  { id: ID(5), project_id: "otro", tool_type: "survey", name: "Ajeno", status: "published", config: survey },
];
const texts = { consent: defaultBatteryConsent("Mi estudio"), thankYou: DEFAULT_BATTERY_THANK_YOU };
const input = (steps: { studyId: string; enabled: boolean }[], over: object = {}) => ({ projectId: P, name: "Mi batería", steps, texts, ...over });

describe("buildBattery", () => {
  it("crea la batería publicada con las posiciones en orden", () => {
    const r = buildBattery(input([{ studyId: ID(1), enabled: true }, { studyId: ID(2), enabled: true }]), studies.slice(0, 2));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("published");
    expect(r.steps).toEqual([
      { position: 0, studyId: ID(1), enabled: true },
      { position: 1, studyId: ID(2), enabled: true },
    ]);
    expect(r.config).toEqual({ version: 1, texts });
    expect(r.warnings).toEqual([]);
  });

  it("deja la batería en borrador si un paso activo no está publicado", () => {
    const r = buildBattery(input([{ studyId: ID(1), enabled: true }, { studyId: ID(3), enabled: true }]), [studies[0]!, studies[2]!]);
    expect(r.ok && r.status).toBe("draft");
    expect(r.ok && r.warnings.map((w) => w.code)).toContain("unpublished_step");
  });

  it("un paso sin publicar pero omitido no impide publicar", () => {
    const r = buildBattery(input([{ studyId: ID(1), enabled: true }, { studyId: ID(3), enabled: false }]), [studies[0]!, studies[2]!]);
    expect(r.ok && r.status).toBe("published");
  });

  it("avisa cuando la encuesta va antes del IAT, sin bloquear", () => {
    const r = buildBattery(input([{ studyId: ID(2), enabled: true }, { studyId: ID(1), enabled: true }]), studies.slice(0, 2));
    expect(r.ok && r.status).toBe("published");
    expect(r.ok && r.warnings.map((w) => w.code)).toEqual(["explicit_before_implicit"]);
  });

  it("rechaza entradas inválidas con un mensaje claro", () => {
    const err = (raw: unknown, s = studies) => {
      const r = buildBattery(raw, s);
      return r.ok ? null : r.error;
    };
    expect(err(input([]))).toMatch(/al menos un estudio/);
    expect(err(input([{ studyId: ID(1), enabled: true }], { name: "  " }))).toMatch(/nombre/);
    expect(err(input([{ studyId: "no-uuid", enabled: true }]))).not.toBeNull();
    expect(err(input([{ studyId: ID(1), enabled: true }, { studyId: ID(1), enabled: true }]))).toMatch(/repetirse/);
    expect(err(input([{ studyId: ID(1), enabled: false }]), studies.slice(0, 1))).toMatch(/pasos activos/);
    expect(err(input(Array.from({ length: 9 }, (_, i) => ({ studyId: `20000000-0000-4000-8000-0000000000${10 + i}`, enabled: true }))))).toMatch(/Máximo/);
  });

  it("rechaza estudios de otra herramienta, de otro proyecto o desconocidos", () => {
    expect(buildBattery(input([{ studyId: ID(4), enabled: true }]), [studies[3]!])).toMatchObject({ ok: false });
    expect(buildBattery(input([{ studyId: ID(5), enabled: true }]), [studies[4]!])).toMatchObject({ ok: false });
    expect(buildBattery(input([{ studyId: ID(1), enabled: true }, { studyId: ID(2), enabled: true }]), [studies[0]!])).toMatchObject({ ok: false });
  });

  it("exige los textos del participante", () => {
    expect(buildBattery(input([{ studyId: ID(1), enabled: true }], { texts: { consent: "", thankYou: "x" } }), studies).ok).toBe(false);
  });
});

describe("toStepInfos", () => {
  it("calcula la duración de cada paso", () => {
    const infos = toStepInfos([{ studyId: ID(1), enabled: true }, { studyId: ID(2), enabled: false }], studies)!;
    expect(infos[0]!.minutes).toBeGreaterThan(0);
    expect(infos[1]).toMatchObject({ enabled: false, tool: "survey", minutes: 1 });
  });
});
