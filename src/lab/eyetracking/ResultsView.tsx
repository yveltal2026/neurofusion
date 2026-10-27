import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import type { ExportedSession } from "./session";

function fmt(v: number | null, digits = 1): string {
  return v === null || !Number.isFinite(v) ? "—" : v.toFixed(digits);
}

const pct = (v: number | null) => (v === null ? null : v * 100);

function Stat({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3.5 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-display text-xl font-semibold text-heading">
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-muted">{unit}</span> : null}
      </dd>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Dónde miró la persona frente a dónde estaba cada objetivo: un sesgo sistemático se ve de un vistazo. */
function GazeMap({ session }: { session: ExportedSession }) {
  const { width, height } = session.viewport;
  const r = Math.max(width, height) * 0.012;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Mapa de objetivos (círculos vacíos) y lectura mediana de la mirada (puntos), unidos por una línea"
      className="w-full rounded-md border border-control bg-background"
    >
      {session.validation.targets.map((t, i) => (
        <g key={i}>
          {t.gaze ? (
            <>
              <line x1={t.target.x} y1={t.target.y} x2={t.gaze.x} y2={t.gaze.y} stroke="var(--danger)" strokeWidth={r * 0.35} />
              <circle cx={t.gaze.x} cy={t.gaze.y} r={r * 0.8} fill="var(--neuro)" />
            </>
          ) : null}
          <circle cx={t.target.x} cy={t.target.y} r={r} fill="none" stroke="var(--heading)" strokeWidth={r * 0.3} />
          <text x={t.target.x} y={t.target.y - r * 1.6} textAnchor="middle" fontSize={r * 1.6} fill="var(--muted)">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function ResultsView({ session }: { session: ExportedSession }) {
  const { summary, verdict, validation } = session;
  return (
    <div className="space-y-6">
      {session.driftChecks?.length ? (
        <Card className="space-y-2">
          <h2 className="font-medium">Controles de deriva</h2>
          {session.driftChecks.map((check, i) => (
            <p key={i} className="text-sm">Control {i + 1}: {check.passed ? "aceptable" : "requiere recalibración"} · error mediano {fmt(check.medianErrorDeg)}° · máximo {fmt(check.maxErrorDeg)}°</p>
          ))}
        </Card>
      ) : null}
      {verdict.pass ? (
        <Alert tone="info">
          <p className="font-medium text-heading">Cumple los criterios del spike para «{session.device}».</p>
        </Alert>
      ) : (
        <Alert tone="warning">
          <p className="font-medium text-heading">No cumple los criterios del spike para «{session.device}».</p>
          <ul className="mt-1 list-disc pl-5">
            {verdict.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Alert>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Error mediano" value={fmt(summary.medianErrorDeg)} unit="°" hint={`${fmt(summary.medianErrorCm)} cm · ${fmt(summary.medianErrorPx, 0)} px`} />
        <Stat label="Error p75" value={fmt(summary.p75ErrorDeg)} unit="°" hint={`máx. ${fmt(summary.maxErrorPx, 0)} px`} />
        <Stat label="Estabilidad" value={fmt(summary.medianPrecisionPx, 0)} unit="px" hint="dispersión entre lecturas (menos es mejor)" />
        <Stat label="Cobertura" value={`${summary.measured}/${summary.targets}`} hint="objetivos con lecturas suficientes" />
        <Stat label="Lecturas por segundo" value={fmt(validation.stream.fps)} hint={`${Math.round(validation.stream.validRatio * 100)} % válidas`} />
        <Stat label="Inferencia (mediana)" value={fmt(validation.stream.inferenceMsMedian, 0)} unit="ms" hint="tiempo en el worker" />
        <Stat label="Carga inicial" value={fmt(session.readyMs / 1000)} unit="s" hint="modelos + cámara" />
        <Stat label="Calibración" value={`${session.calibration.clicks}`} unit="clics" hint={`${fmt(session.calibration.durationMs / 1000, 0)} s`} />
      </dl>

      <Card className="space-y-2">
        <h2 className="text-base font-semibold">Diagnóstico por eje</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Ganancia horizontal"
            value={fmt(session.diagnostics.x.gain, 2)}
            hint={`sesgo ${fmt(session.diagnostics.x.biasPx, 0)} px · R² ${fmt(session.diagnostics.x.r2, 2)}`}
          />
          <Stat
            label="Ganancia vertical"
            value={fmt(session.diagnostics.y.gain, 2)}
            hint={`sesgo ${fmt(session.diagnostics.y.biasPx, 0)} px · R² ${fmt(session.diagnostics.y.r2, 2)}`}
          />
          <Stat
            label="Error en % del área"
            value={`${fmt(pct(session.diagnostics.normalizedErrorX), 0)} / ${fmt(pct(session.diagnostics.normalizedErrorY), 0)}`}
            unit="%"
            hint="horizontal / vertical"
          />
          <Stat
            label="Área de prueba"
            value={`${fmt(session.diagnostics.span.widthCm, 0)}×${fmt(session.diagnostics.span.heightCm, 0)}`}
            unit="cm"
            hint={`±${fmt(session.diagnostics.span.halfAngleXDeg, 0)}° × ±${fmt(session.diagnostics.span.halfAngleYDeg, 0)}°`}
          />
        </dl>
        <p className="text-xs text-muted">
          Ganancia 1 = la mirada se mueve lo mismo que el objetivo; menos de 0.6 en un eje significa que casi no distingue
          posiciones en ese eje. Un sesgo grande y constante apunta a un problema de calibración o de postura. Como
          referencia, una laptop de 31 cm a 50 cm abarca ±17° en horizontal.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">Objetivos vs. mirada</h2>
        <GazeMap session={session} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 pr-3">#</th>
                <th className="py-1 pr-3">Lecturas</th>
                <th className="py-1 pr-3">Error (px)</th>
                <th className="py-1">Dispersión (px)</th>
              </tr>
            </thead>
            <tbody>
              {validation.targets.map((t, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1 pr-3">{i + 1}</td>
                  <td className="py-1 pr-3">{t.samples}</td>
                  <td className="py-1 pr-3">{fmt(t.errorPx, 0)}</td>
                  <td className="py-1">{fmt(t.precisionPx, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
