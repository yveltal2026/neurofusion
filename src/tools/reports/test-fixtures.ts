import type { StudyRow, VisualAssetRow } from "@/lib/db/types";
import {
  computeSurveyAggregates,
  type SurveyConfig,
} from "@/tools/survey/engine";
import type { SurveyRecord } from "@/tools/survey/results/load";
import type { EyeQuality } from "@/tools/visual/eye/schema";
import type { PieceAiResult } from "@/tools/visual/analysis/piece";
import type { VisualAsset } from "@/tools/visual/results";
import { joinEyeReportRuns } from "@/tools/eyetracking/results/load";
import { surveyReportSnapshot } from "./model";

export const STUDY_ID = "11111111-1111-4111-8111-111111111111";
export const ASSET_ID = "22222222-2222-4222-8222-222222222222";
export const surveyConfig: SurveyConfig = {
  version: 1,
  title: "Percepción de producto",
  texts: { consent: "Acepto", thankYou: "Gracias" },
  blocks: [
    {
      kind: "questions",
      id: "questions",
      questions: [
        {
          id: "buy",
          type: "select",
          prompt: "¿Comprarías este producto?",
          required: true,
          options: ["Sí", "No"],
        },
        {
          id: "appeal",
          type: "likert",
          prompt: "Atractivo del producto",
          required: true,
          points: 5,
        },
        {
          id: "comment",
          type: "text",
          prompt: "¿Qué mejorarías?",
          required: false,
        },
      ],
    },
    { kind: "instrument", id: "nps", instrumentId: "nps", required: true },
  ],
};
export function surveyRecords(): SurveyRecord[] {
  return Array.from({ length: 4 }, (_, i) => ({
    id: `private-session-${i}`,
    participantRef: `private-person-${i}`,
    deviceType: "desktop",
    startedAt: "2026-10-31T00:00:00Z",
    completedAt: "2026-10-31T00:01:00Z",
    excluded: i === 3,
    excludedReason: null,
    answers: {
      buy: i === 2 ? "No" : "Sí",
      appeal: i + 2,
      nps_1: i === 2 ? 5 : 9,
      comment: i === 3 ? "EXCLUDED_SECRET" : `PRIVATE_TEXT_${i}`,
    },
  }));
}
export const surveySource = () => ({
  kind: "survey" as const,
  config: surveyConfig,
  records: surveyRecords(),
  snapshot: surveyReportSnapshot(
    surveyConfig.title,
    computeSurveyAggregates(surveyConfig, surveyRecords()),
  ),
});
export const study: StudyRow = {
  id: STUDY_ID,
  project_id: "33333333-3333-4333-8333-333333333333",
  tool_type: "survey",
  name: "Estudio de producto",
  status: "published",
  config: surveyConfig,
  access_token: "t".repeat(43),
  max_responses: null,
  closes_at: null,
  duplicate_policy: "none",
  created_by: null,
  created_at: "2026-10-31T00:00:00Z",
  updated_at: "2026-10-31T00:00:00Z",
};

export const quality: EyeQuality = {
  engineId: "webeyetrack@0.0.2",
  passed: true,
  medianErrorDeg: 1,
  coverage: 1,
  fps: 30,
  validRatio: 1,
  calibrationClicks: 9,
  calibrationLayout: "v4-test",
};
export const observation = (x = 0.2) => ({
  assetId: ASSET_ID,
  durationMs: 5000,
  framesTotal: 5,
  framesValid: 5,
  samples: Array.from({ length: 5 }, (_, i) => ({
    t: 100 + i * 50,
    x,
    y: 0.5,
  })),
});
export function eyeRecords() {
  return joinEyeReportRuns(
    [
      { id: "private-1", excluded: false },
      { id: "private-2", excluded: false },
      { id: "private-3", excluded: false },
      { id: "private-4", excluded: true },
    ],
    [
      {
        session_id: "private-1",
        validation: quality,
        observations: [observation()],
      },
      {
        session_id: "private-2",
        validation: quality,
        observations: [observation(0.8)],
      },
      {
        session_id: "private-3",
        validation: quality,
        observations: [observation()],
      },
      {
        session_id: "private-4",
        validation: quality,
        observations: [observation(0.8)],
      },
    ],
  );
}
export function asset(analyzed = true): VisualAsset {
  const criterion = (score: number) => ({
    score,
    evidence: "Evidencia de la pieza",
  });
  const result: PieceAiResult = {
    summary: "La pieza comunica el producto con claridad",
    message: "Producto nuevo",
    firstSeconds: "Destaca el envase",
    elements: [],
    criteria: {
      clarity: criterion(4),
      hierarchy: criterion(3),
      cta: criterion(2),
      legibility: criterion(4),
      brand: criterion(4),
      load: criterion(3),
    },
    issues: [
      {
        severity: "high",
        elementId: null,
        problem: "La acción no destaca",
        recommendation: "Aumentar el contraste del botón",
      },
    ],
    strengths: ["Producto visible"],
    limitations: ["Estimación sin participantes"],
  };
  const row: VisualAssetRow = {
    id: ASSET_ID,
    study_id: STUDY_ID,
    storage_path: `${STUDY_ID}/private-image.png`,
    file_name: "private-image.png",
    mime_type: "image/png",
    width: 1000,
    height: 500,
    bytes: 3000,
    sha256: "a".repeat(64),
    title: "Pieza principal",
    placement: null,
    site_key: null,
    task_id: null,
    position: 0,
    metrics: null,
    metrics_version: null,
    ai_result: null,
    ai_provider: null,
    ai_model: null,
    ai_engine_version: null,
    ai_generated_at: null,
    aois: [],
    aois_source: "analyst",
    aois_reviewed_at: null,
    created_at: "2026-10-31T00:00:00Z",
  };
  const aois: VisualAsset["aois"] = [
    {
      id: "logo",
      label: "Logotipo",
      kind: "logo",
      box: [0, 0, 0.4, 1],
      attention: 0.5,
      importance: 4,
      order: 1,
    },
  ];
  return {
    row,
    aois,
    metrics: null,
    result: analyzed ? result : null,
    ai: analyzed
      ? {
          result,
          aois,
          coverage: 1,
          tiles: 1,
          provider: "fake",
          model: "fake",
          generatedAt: "2026-10-31T00:00:00Z",
          engineVersion: "test",
        }
      : null,
  };
}
export const briefReport = {
  executiveSummary:
    "El producto interesa a parte de la muestra; se necesita ampliar la validación.",
  findings: [
    {
      headline: "Interés declarado",
      evidence: "Dos de tres respuestas incluidas son afirmativas.",
    },
  ],
  recommendations: ["Ampliar la muestra antes de tomar decisiones."],
  limitations: ["Muestra pequeña y no representativa."],
};
