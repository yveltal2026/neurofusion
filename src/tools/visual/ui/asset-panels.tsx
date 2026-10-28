import { Block } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CRITERIA_LABEL, type PieceAiResult } from "../analysis/piece";
import {
  AOI_KIND_LABEL,
  coldZones,
  LOW_ATTENTION,
  type Aoi,
} from "../engine/aoi";
import { describeMetrics } from "../engine/metrics";
import { checkPlacement, getPlacement } from "../engine/placements";
import type { StoredMetrics } from "../results";
import { primaryFindings } from "../analysis/findings";
import { PredictedEyeMetrics } from "./predicted-eye-metrics";

const SEV = { high: "Alta", medium: "Media", low: "Baja" } as const;
const SEV_TONE = { high: "danger", medium: "warning", low: "neutral" } as const;

export function ScoreDots({ score }: { score: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${score} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${i <= score ? "bg-primary" : "bg-foreground/15"}`}
        />
      ))}
    </span>
  );
}

export function AiReading({
  result,
  aois,
  analyzedAois = aois,
  asset,
}: {
  result: PieceAiResult;
  aois: Aoi[];
  analyzedAois?: Aoi[];
  asset?: { id: string; title: string };
}) {
  const cold = coldZones(aois);
  const findings = primaryFindings(result, aois);
  return (
    <div className="space-y-4">
      <Block className="space-y-2">
        <h3 className="text-lg font-semibold">Lectura de la IA</h3>
        <p className="text-sm leading-relaxed">{result.summary}</p>
        <p className="text-sm">
          <span className="text-muted">Mensaje que comunica:</span>{" "}
          {result.message}
        </p>
        <p className="text-sm">
          <span className="text-muted">Primeros segundos:</span>{" "}
          {result.firstSeconds}
        </p>
      </Block>
      <div className="grid gap-4 md:grid-cols-2">
        <Block className="space-y-2">
          <h3 className="text-lg font-semibold">Aciertos principales</h3>
          {findings.strengths.length ? (
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {findings.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              No se identificaron aciertos destacados en esta lectura.
            </p>
          )}
        </Block>
        <Block className="space-y-3">
          <h3 className="text-lg font-semibold">Debilidades principales</h3>
          {findings.weaknesses.length ? (
            <ul className="space-y-3 text-sm">
              {findings.weaknesses.map((w) => (
                <li key={w.problem}>
                  <StatusBadge tone={SEV_TONE[w.severity]}>
                    Prioridad {SEV[w.severity].toLowerCase()}
                  </StatusBadge>
                  <p className="mt-1 font-medium">{w.problem}</p>
                  {w.elementId ? (
                    <p className="text-xs text-muted">
                      {aois.find((a) => a.id === w.elementId)?.label ??
                        w.elementId}
                    </p>
                  ) : null}
                  <p className="mt-1 text-muted">{w.recommendation}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              Esta lectura no identificó debilidades principales; valida la
              pieza en su contexto de uso.
            </p>
          )}
        </Block>
      </div>
      {result.strengths.length > 3 ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            Otros aciertos identificados
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {result.strengths.slice(3).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <PredictedEyeMetrics
        result={result}
        aois={aois}
        analyzedAois={analyzedAois}
        asset={asset}
      />
      <Block className="space-y-3">
        <h3 className="text-lg font-semibold">Criterios (1–5)</h3>
        <dl className="space-y-2 text-sm">
          {(Object.keys(CRITERIA_LABEL) as (keyof typeof CRITERIA_LABEL)[]).map(
            (k) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[200px_90px_1fr]">
                <dt className="font-medium">{CRITERIA_LABEL[k]}</dt>
                <dd>
                  <ScoreDots score={result.criteria[k].score} />
                </dd>
                <dd className="text-muted">{result.criteria[k].evidence}</dd>
              </div>
            ),
          )}
        </dl>
      </Block>
      {result.issues.length ? (
        <Block className="space-y-2">
          <h3 className="text-lg font-semibold">Problemas y recomendaciones</h3>
          <ul className="space-y-2 text-sm">
            {result.issues.map((i) => (
              <li key={i.problem} className="space-y-0.5">
                <StatusBadge tone={SEV_TONE[i.severity]}>
                  Prioridad {SEV[i.severity].toLowerCase()}
                </StatusBadge>{" "}
                {i.problem}
                <span className="block text-muted">→ {i.recommendation}</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
      {aois.length ? (
        <Block className="space-y-1">
          <h3 className="text-lg font-semibold">Zonas ciegas</h3>
          <p className="text-xs text-muted">
            AOI = zona de interés: un elemento de la pieza (logo, precio, botón) que se mide aparte. Elementos con atracción estimada baja (≤{" "}
            {Math.round(LOW_ATTENTION * 100)} %): «zona ciega» si son
            importantes (4–5) y «baja atención» si su importancia es media (3).
          </p>
          {cold.length ? (
            <ul className="list-disc pl-5 text-sm">
              {cold.map(({ aoi: a, level }) => (
                <li key={a.id}>
                  {a.label} ({AOI_KIND_LABEL[a.kind]}) ·{" "}
                  {level === "blind" ? "zona ciega" : "baja atención"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              No se detectaron: ningún elemento importante tiene atención baja.
            </p>
          )}
        </Block>
      ) : null}
      {result.limitations.length ? (
        <Block className="space-y-1">
          <h3 className="text-lg font-semibold">Límites de la lectura</h3>
          <ul className="list-disc pl-5 text-sm">
            {result.limitations.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Block>
      ) : null}
    </div>
  );
}

export function MetricsPanel({
  metrics,
  img,
}: {
  metrics: StoredMetrics;
  img: {
    width: number;
    height: number;
    bytes: number;
    placement: string | null;
  };
}) {
  const d = describeMetrics(metrics);
  const spec = getPlacement(img.placement);
  const checks = spec ? checkPlacement(spec, img) : [];
  return (
    <Block className="space-y-3 break-inside-avoid">
      <div>
        <h3 className="text-lg font-semibold">Métricas de imagen</h3>
        <p className="text-xs text-muted">
          Medidas deterministas sobre los píxeles ({metrics.version}).
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Contraste global (RMS)</dt>
        <dd>
          {metrics.rmsContrast} · {d.contrast}
        </dd>
        <dt className="text-muted">Saturación visual (bordes)</dt>
        <dd>
          {Math.round(metrics.edgeDensity * 100)} % · {d.clutter}
        </dd>
        <dt className="text-muted">Espacio negativo</dt>
        <dd>{Math.round(metrics.negativeSpace * 100)} %</dd>
        <dt className="text-muted">Colorido</dt>
        <dd>
          {metrics.colorfulness} · {d.colorfulness}
        </dd>
        <dt className="text-muted">Luminancia media</dt>
        <dd>{metrics.meanLuminance}</dd>
      </dl>
      <div className="flex flex-wrap gap-1.5" aria-label="Paleta dominante">
        {metrics.palette.map((p) => (
          <span key={p.hex} className="flex items-center gap-1 text-xs">
            <span
              className="inline-block h-4 w-4 rounded border border-border"
              style={{ background: p.hex }}
            />
            {p.hex} {Math.round(p.share * 100)} %
          </span>
        ))}
      </div>
      {metrics.textContrast?.length ? (
        <div>
          <p className="text-sm font-medium">
            Contraste estimado de textos (WCAG)
          </p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {metrics.textContrast.map((t) => (
              <li key={t.id}>
                {t.label}: <strong>{t.ratio}:1</strong>{" "}
                <StatusBadge
                  tone={
                    t.ratio < 3
                      ? "danger"
                      : t.ratio < 4.5
                        ? "warning"
                        : "success"
                  }
                >
                  {t.ratio < 3
                    ? "Insuficiente"
                    : t.ratio < 4.5
                      ? "Sólo texto grande"
                      : "Adecuado"}
                </StatusBadge>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            Estimación por percentiles de luminancia dentro de cada caja;
            verifica en el archivo fuente.
          </p>
        </div>
      ) : null}
      {spec ? (
        <div>
          <p className="text-sm font-medium">Formato: {spec.label}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {checks.map((c) => (
              <li key={c.label}>
                <StatusBadge tone={c.ok ? "success" : "danger"}>
                  {c.ok ? "Cumple" : "No cumple"}
                </StatusBadge>{" "}
                {c.label}: {c.detail}
              </li>
            ))}
          </ul>
          {spec.note ? <p className="text-xs text-muted">{spec.note}</p> : null}
        </div>
      ) : null}
    </Block>
  );
}
