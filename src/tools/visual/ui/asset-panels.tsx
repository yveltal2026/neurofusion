import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CRITERIA_LABEL, type PieceAiResult } from "../analysis/piece";
import { AOI_KIND_LABEL, blindZones, type Aoi } from "../engine/aoi";
import { describeMetrics } from "../engine/metrics";
import { checkPlacement, getPlacement } from "../engine/placements";
import type { StoredMetrics } from "../results";

const SEV = { high: "Alta", medium: "Media", low: "Baja" } as const;
const SEV_TONE = { high: "danger", medium: "warning", low: "neutral" } as const;

export function ScoreDots({ score }: { score: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${score} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full ${i <= score ? "bg-primary" : "bg-foreground/15"}`} />
      ))}
    </span>
  );
}

export function AiReading({ result, aois }: { result: PieceAiResult; aois: Aoi[] }) {
  const blind = blindZones(aois);
  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h3 className="font-medium">Lectura de la IA</h3>
        <p className="text-sm leading-relaxed">{result.summary}</p>
        <p className="text-sm">
          <span className="text-muted">Mensaje que comunica:</span> {result.message}
        </p>
        <p className="text-sm">
          <span className="text-muted">Primeros segundos:</span> {result.firstSeconds}
        </p>
      </Card>
      <Card className="space-y-3">
        <h3 className="font-medium">Criterios (1–5)</h3>
        <dl className="space-y-2 text-sm">
          {(Object.keys(CRITERIA_LABEL) as (keyof typeof CRITERIA_LABEL)[]).map((k) => (
            <div key={k} className="grid gap-1 sm:grid-cols-[200px_90px_1fr]">
              <dt className="font-medium">{CRITERIA_LABEL[k]}</dt>
              <dd>
                <ScoreDots score={result.criteria[k].score} />
              </dd>
              <dd className="text-muted">{result.criteria[k].evidence}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {result.issues.length ? (
        <Card className="space-y-2">
          <h3 className="font-medium">Problemas y recomendaciones</h3>
          <ul className="space-y-2 text-sm">
            {result.issues.map((i) => (
              <li key={i.problem} className="space-y-0.5">
                <StatusBadge tone={SEV_TONE[i.severity]}>Prioridad {SEV[i.severity].toLowerCase()}</StatusBadge> {i.problem}
                <span className="block text-muted">→ {i.recommendation}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {blind.length ? (
        <Card className="space-y-1">
          <h3 className="font-medium">Zonas ciegas</h3>
          <p className="text-xs text-muted">Elementos importantes (4–5) con atracción estimada baja (≤ 40 %).</p>
          <ul className="list-disc pl-5 text-sm">
            {blind.map((a) => (
              <li key={a.id}>
                {a.label} ({AOI_KIND_LABEL[a.kind]})
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {result.strengths.length ? (
        <Card className="space-y-1">
          <h3 className="font-medium">Fortalezas</h3>
          <ul className="list-disc pl-5 text-sm">
            {result.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {result.limitations.length ? (
        <Card className="space-y-1">
          <h3 className="font-medium">Límites de la lectura</h3>
          <ul className="list-disc pl-5 text-sm">
            {result.limitations.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

export function MetricsPanel({ metrics, img }: { metrics: StoredMetrics; img: { width: number; height: number; bytes: number; placement: string | null } }) {
  const d = describeMetrics(metrics);
  const spec = getPlacement(img.placement);
  const checks = spec ? checkPlacement(spec, img) : [];
  return (
    <Card className="space-y-3 break-inside-avoid">
      <div>
        <h3 className="font-medium">Métricas de imagen</h3>
        <p className="text-xs text-muted">Medidas deterministas sobre los píxeles ({metrics.version}).</p>
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
            <span className="inline-block h-4 w-4 rounded border border-border" style={{ background: p.hex }} />
            {p.hex} {Math.round(p.share * 100)} %
          </span>
        ))}
      </div>
      {metrics.textContrast?.length ? (
        <div>
          <p className="text-sm font-medium">Contraste estimado de textos (WCAG)</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {metrics.textContrast.map((t) => (
              <li key={t.id}>
                {t.label}: <strong>{t.ratio}:1</strong>
{" "}
                <StatusBadge tone={t.ratio < 3 ? "danger" : t.ratio < 4.5 ? "warning" : "success"}>
                  {t.ratio < 3 ? "Insuficiente" : t.ratio < 4.5 ? "Sólo texto grande" : "Adecuado"}
                </StatusBadge>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Estimación por percentiles de luminancia dentro de cada caja; verifica en el archivo fuente.</p>
        </div>
      ) : null}
      {spec ? (
        <div>
          <p className="text-sm font-medium">Formato: {spec.label}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {checks.map((c) => (
              <li key={c.label}>
                <StatusBadge tone={c.ok ? "success" : "danger"}>{c.ok ? "Cumple" : "No cumple"}</StatusBadge> {c.label}: {c.detail}
              </li>
            ))}
          </ul>
          {spec.note ? <p className="text-xs text-muted">{spec.note}</p> : null}
        </div>
      ) : null}
    </Card>
  );
}
