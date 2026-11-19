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
import { checkPlacement, getPlacement, type PlacementSpec } from "../engine/placements";
import type { StoredMetrics } from "../results";
import { primaryFindings } from "../analysis/findings";
import { PredictedEyeMetrics } from "./predicted-eye-metrics";

const SEV = { high: "Alta", medium: "Media", low: "Baja" } as const;
const SEV_TONE = { high: "danger", medium: "warning", low: "neutral" } as const;
const SEV_ORDER = { high: 0, medium: 1, low: 2 } as const;
const CRITERIA_KEYS = Object.keys(CRITERIA_LABEL) as (keyof typeof CRITERIA_LABEL)[];

type Img = { width: number; height: number; bytes: number; placement: string | null };

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <h3 className="text-lg font-semibold text-heading">{title}</h3>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none">
      <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

/** Lectura general de la IA: resumen, mensaje y primeros segundos. */
export function AiSummary({ result }: { result: PieceAiResult }) {
  return (
    <section className="space-y-3">
      <SectionHeading title="Lectura de la IA" />
      <p className="text-base leading-relaxed">{result.summary}</p>
      <dl className="grid gap-3 text-sm @lg:grid-cols-2">
        <div className="space-y-0.5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Mensaje que comunica</dt>
          <dd>{result.message}</dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Primeros segundos</dt>
          <dd>{result.firstSeconds}</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * Calificador rápido: los seis criterios (1–5) con su promedio. En pantalla cada criterio es un
 * acordeón con su evidencia; `collapsible={false}` la deja visible (informe impreso).
 */
export function CriteriaScores({ result, collapsible = true }: { result: PieceAiResult; collapsible?: boolean }) {
  const avg = CRITERIA_KEYS.reduce((s, k) => s + result.criteria[k].score, 0) / CRITERIA_KEYS.length;
  return (
    <section className="space-y-3 break-inside-avoid">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <SectionHeading
          title="Calificación por criterio"
          hint={collapsible ? "Escala 1–5 estimada por la IA. Abre un criterio para ver su evidencia." : "Escala 1–5 estimada por la IA."}
        />
        <p className="flex items-baseline gap-1">
          <span className="font-display text-3xl font-bold leading-none tabular-nums text-heading">{avg.toLocaleString("es-MX", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</span>
          <span className="text-sm text-muted">/ 5 promedio</span>
        </p>
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {CRITERIA_KEYS.map((k) => {
          const { score, evidence } = result.criteria[k];
          const row = (
            <>
              <span className="min-w-0 flex-1 text-sm font-medium">{CRITERIA_LABEL[k]}</span>
              {score <= 2 ? <StatusBadge tone="warning">Mejorar</StatusBadge> : null}
              <ScoreDots score={score} />
              <span className="w-7 text-right text-sm tabular-nums text-muted">{score}/5</span>
            </>
          );
          return (
            <li key={k}>
              {collapsible ? (
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-2 hover:text-heading [&::-webkit-details-marker]:hidden">
                    {row}
                    <Chevron />
                  </summary>
                  <p className="pb-3 pr-7 text-sm text-muted">{evidence}</p>
                </details>
              ) : (
                <div className="space-y-1 py-2">
                  <div className="flex items-center gap-3">{row}</div>
                  <p className="text-sm text-muted">{evidence}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Los tres aciertos y las tres debilidades con más prioridad. */
export function TopFindings({ result, aois }: { result: PieceAiResult; aois: Aoi[] }) {
  const findings = primaryFindings(result, aois);
  return (
    <div className="grid gap-6 @xl:grid-cols-2">
      <section className="space-y-2">
        <SectionHeading title="Aciertos principales" />
        {findings.strengths.length ? (
          <ul className="space-y-2 text-sm">
            {findings.strengths.map((s) => (
              <li key={s} className="flex gap-2">
                <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No se identificaron aciertos destacados en esta lectura.</p>
        )}
      </section>
      <section className="space-y-2">
        <SectionHeading title="Debilidades principales" />
        {findings.weaknesses.length ? (
          <ul className="space-y-3 text-sm">
            {findings.weaknesses.map((w) => (
              <li key={w.problem} className="space-y-1">
                <StatusBadge tone={SEV_TONE[w.severity]}>Prioridad {SEV[w.severity].toLowerCase()}</StatusBadge>
                <p className="font-medium">{w.problem}</p>
                {w.elementId ? <p className="text-xs text-muted">{aois.find((a) => a.id === w.elementId)?.label ?? w.elementId}</p> : null}
                <p className="text-muted">{w.recommendation}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Esta lectura no identificó debilidades principales; valida la pieza en su contexto de uso.</p>
        )}
      </section>
    </div>
  );
}

export function IssuesList({ result }: { result: PieceAiResult }) {
  if (!result.issues.length) return null;
  const issues = [...result.issues].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return (
    <section className="space-y-3">
      <SectionHeading title="Problemas y recomendaciones" />
      <ul className="divide-y divide-border border-y border-border text-sm">
        {issues.map((i) => (
          <li key={i.problem} className="space-y-1 py-3">
            <StatusBadge tone={SEV_TONE[i.severity]}>Prioridad {SEV[i.severity].toLowerCase()}</StatusBadge>
            <p className="font-medium">{i.problem}</p>
            <p className="text-muted">→ {i.recommendation}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BlindZones({ aois }: { aois: Aoi[] }) {
  if (!aois.length) return null;
  const cold = coldZones(aois);
  return (
    <section className="space-y-2">
      <SectionHeading
        title="Zonas ciegas"
        hint={`AOI = zona de interés: un elemento de la pieza (logo, precio, botón) que se mide aparte. Atracción estimada ≤ ${Math.round(LOW_ATTENTION * 100)} %: «zona ciega» si es importante (4–5) y «baja atención» si su importancia es media (3).`}
      />
      {cold.length ? (
        <ul className="space-y-1 text-sm">
          {cold.map(({ aoi: a, level }) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={level === "blind" ? "danger" : "warning"}>{level === "blind" ? "Zona ciega" : "Baja atención"}</StatusBadge>
              <span>
                {a.label} <span className="text-muted">({AOI_KIND_LABEL[a.kind]})</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No se detectaron: ningún elemento importante tiene atención baja.</p>
      )}
    </section>
  );
}

export function AllStrengths({ result, from = 0, title = "Aciertos identificados" }: { result: PieceAiResult; from?: number; title?: string }) {
  const items = result.strengths.slice(from);
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <SectionHeading title={title} />
      <ul className="space-y-1.5 text-sm">
        {items.map((s) => (
          <li key={s} className="flex gap-2">
            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Limitations({ result, collapsible = true }: { result: PieceAiResult; collapsible?: boolean }) {
  if (!result.limitations.length) return null;
  const list = (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
      {result.limitations.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ul>
  );
  if (!collapsible) {
    return (
      <section className="space-y-2">
        <SectionHeading title="Límites de la lectura" />
        {list}
      </section>
    );
  }
  return (
    <details className="group border-y border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold text-heading [&::-webkit-details-marker]:hidden">
        Límites de la lectura ({result.limitations.length})
        <Chevron />
      </summary>
      <div className="pb-3">{list}</div>
    </details>
  );
}

/** Lectura completa en una sola columna (informe imprimible). */
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
  return (
    <div className="@container space-y-8">
      <AiSummary result={result} />
      <CriteriaScores result={result} collapsible={false} />
      <TopFindings result={result} aois={aois} />
      {result.strengths.length > 3 ? <AllStrengths result={result} from={3} title="Otros aciertos identificados" /> : null}
      <PredictedEyeMetrics result={result} aois={aois} analyzedAois={analyzedAois} asset={asset} />
      <IssuesList result={result} />
      <BlindZones aois={aois} />
      <Limitations result={result} collapsible={false} />
    </div>
  );
}

/** Cumplimiento del formato elegido, para resumirlo en una etiqueta. */
export function formatStatus(img: Img): { spec: PlacementSpec; passed: number; total: number } | null {
  const spec = getPlacement(img.placement);
  if (!spec) return null;
  const checks = checkPlacement(spec, img);
  return { spec, passed: checks.filter((c) => c.ok).length, total: checks.length };
}

export function FormatChecks({ img }: { img: Img }) {
  const spec = getPlacement(img.placement);
  if (!spec) {
    return (
      <section className="space-y-2">
        <SectionHeading title="Formato" />
        <p className="text-sm text-muted">Sin formato asignado. Elígelo en la pestaña «Pieza» para revisar tamaño, proporción y peso.</p>
      </section>
    );
  }
  const checks = checkPlacement(spec, img);
  return (
    <section className="space-y-2 break-inside-avoid">
      <SectionHeading title="Formato" hint={`${spec.group} · ${spec.label}`} />
      <ul className="divide-y divide-border border-y border-border text-sm">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="font-medium">{c.label}</p>
              <p className="text-xs text-muted">{c.detail}</p>
            </div>
            <StatusBadge tone={c.ok ? "success" : "danger"}>{c.ok ? "Cumple" : "No cumple"}</StatusBadge>
          </li>
        ))}
      </ul>
      {spec.note ? <p className="text-xs text-muted">{spec.note}</p> : null}
    </section>
  );
}

export function TextContrast({ metrics }: { metrics: StoredMetrics }) {
  if (!metrics.textContrast?.length) return null;
  return (
    <section className="space-y-2 break-inside-avoid">
      <SectionHeading title="Contraste de textos (WCAG)" hint="Estimación por percentiles de luminancia dentro de cada caja; verifica en el archivo fuente." />
      <ul className="divide-y divide-border border-y border-border text-sm">
        {metrics.textContrast.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 flex-1">{t.label}</span>
            <strong className="tabular-nums">{t.ratio}:1</strong>
            <StatusBadge tone={t.ratio < 3 ? "danger" : t.ratio < 4.5 ? "warning" : "success"}>
              {t.ratio < 3 ? "Insuficiente" : t.ratio < 4.5 ? "Sólo texto grande" : "Adecuado"}
            </StatusBadge>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ImageMetrics({ metrics }: { metrics: StoredMetrics }) {
  const d = describeMetrics(metrics);
  const rows: [string, string][] = [
    ["Contraste global (RMS)", `${metrics.rmsContrast} · ${d.contrast}`],
    ["Saturación visual (bordes)", `${Math.round(metrics.edgeDensity * 100)} % · ${d.clutter}`],
    ["Espacio negativo", `${Math.round(metrics.negativeSpace * 100)} %`],
    ["Colorido", `${metrics.colorfulness} · ${d.colorfulness}`],
    ["Luminancia media", String(metrics.meanLuminance)],
  ];
  return (
    <section className="space-y-3 break-inside-avoid">
      <SectionHeading title="Métricas de imagen" hint={`Medidas deterministas sobre los píxeles (${metrics.version}).`} />
      <dl className="divide-y divide-border border-y border-border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {metrics.palette.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Paleta dominante</p>
          <div className="flex h-6 overflow-hidden rounded border border-border" aria-hidden="true">
            {metrics.palette.map((p) => (
              <span key={p.hex} style={{ background: p.hex, flexGrow: Math.max(p.share, 0.02) }} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Paleta dominante">
            {metrics.palette.map((p) => (
              <li key={p.hex} className="flex items-center gap-1 tabular-nums">
                <span className="inline-block size-3 rounded-sm border border-border" style={{ background: p.hex }} />
                {p.hex} {Math.round(p.share * 100)} %
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Métricas, contraste y formato en un solo bloque (informe imprimible). */
export function MetricsPanel({ metrics, img }: { metrics: StoredMetrics; img: Img }) {
  return (
    <Block className="space-y-6 break-inside-avoid">
      <ImageMetrics metrics={metrics} />
      <TextContrast metrics={metrics} />
      {getPlacement(img.placement) ? <FormatChecks img={img} /> : null}
    </Block>
  );
}
