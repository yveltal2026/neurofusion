import type { ReactNode } from "react";
import { VariantHistogram } from "@/components/charts/variant-charts";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import type { OneSampleTest } from "@/tools/iat/engine/math";
import { VARIANT_INFO, type VariantConfig } from "../config";
import { FLAG_LABEL, UNIT_LABEL, type Estimate, type VariantAggregates } from "../results/aggregate";

/** Muestra por debajo de la cual los intervalos son tan amplios que conviene decirlo. */
const SMALL_SAMPLE = 30;

const nf = (d: number) => new Intl.NumberFormat("es-MX", { maximumFractionDigits: d, minimumFractionDigits: d });
const num = (n: number, d: number) => nf(d).format(n);
const digitsOf = (unit: VariantAggregates["unit"]) => (unit === "ms" ? 0 : 2);

function pValue(p: number): string {
  return p < 0.001 ? "< 0,001" : nf(3).format(p);
}

/** Cómo leer el signo de la medida principal, según la variante. */
function reading(config: VariantConfig): string {
  const a = config.attribute;
  switch (config.variant) {
    case "sc_iat":
      return `D > 0: «${config.concepts[0].label}» se asocia más rápido con «${a.positiveLabel}» que con «${a.negativeLabel}». D < 0: al revés. Cerca de 0: sin asociación diferencial.`;
    case "gnat":
      return config.concepts.length === 1
        ? `Diferencia de d′ entre la combinación con «${a.positiveLabel}» y con «${a.negativeLabel}». Positiva: «${config.concepts[0].label}» se detecta mejor junto a lo positivo.`
        : `Contraste de «${config.concepts[0].label}» menos el de «${config.concepts[1].label}» (cada uno: d′ con «${a.positiveLabel}» menos d′ con «${a.negativeLabel}»). Positivo: «${config.concepts[0].label}» se asocia más a lo positivo.`;
    case "priming":
      return config.concepts.length === 1
        ? `Cuánto más rápido (en ms) se clasifican las palabras buenas que las malas tras «${config.concepts[0].label}», menos esa misma ventaja tras el prime de control. Positivo: activa una evaluación positiva.`
        : `Efecto de «${config.concepts[0].label}» menos el de «${config.concepts[1].label}» (cada uno frente al control). Positivo: «${config.concepts[0].label}» activa más lo positivo.`;
  }
}

function EstimateLine({ e, unit }: { e: Estimate; unit: VariantAggregates["unit"] }) {
  const d = digitsOf(unit);
  const t: OneSampleTest | null = e.test;
  if (e.mean === null) return <span className="text-muted">sin datos</span>;
  return (
    <span className="tabular-nums">
      {num(e.mean, d)} {unit === "ms" ? "ms" : ""}
      {t ? (
        <span className="text-muted">
          {" "}
          · IC95 % {num(t.ci95[0], d)} a {num(t.ci95[1], d)} · t({t.df}) = {num(t.t, 2)}, p {pValue(t.p)} · d de Cohen = {num(t.cohenD, 2)}
        </span>
      ) : (
        <span className="text-muted"> · sin intervalo (se necesitan 2 o más)</span>
      )}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

export function VariantResultsView({ config, aggregates: a }: { config: VariantConfig; aggregates: VariantAggregates }) {
  const unit = UNIT_LABEL[a.unit];
  const info = VARIANT_INFO[config.variant];

  if (a.nCompleted === 0) {
    return (
      <EmptyState icon="inbox" title="Aún no hay participantes">
        Comparte la liga desde el Resumen. Cuando alguien termine, sus resultados aparecen aquí con sus advertencias de calidad.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon="user" label="Completaron" value={a.nCompleted} />
        <StatTile icon="check" label="Entran al promedio" value={a.nIncluded} />
        <StatTile icon="alert" label="Con advertencias de calidad" value={a.nFlagged} />
        <StatTile icon="ban" label="Excluidos a mano" value={a.nManuallyExcluded} />
      </div>

      {a.nIncluded > 0 && a.nIncluded < SMALL_SAMPLE ? (
        <Alert tone="info">
          Con menos de {SMALL_SAMPLE} participantes en el promedio, los intervalos son muy amplios: toma las cifras como una primera lectura, no como una conclusión.
        </Alert>
      ) : null}

      <Card className="space-y-4">
        <SectionTitle icon="results">Resultado principal · {info.short}</SectionTitle>
        {a.primary.test ? (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[200px_1fr]">
            <Row label={`Media (${unit})`}>
              <EstimateLine e={a.primary} unit={a.unit} />
            </Row>
            <Row label="Participantes">{a.primary.n}</Row>
          </dl>
        ) : (
          <p className="text-sm text-muted">
            {a.nIncluded < 2 ? "Se necesitan al menos 2 participantes sin advertencias para calcular el promedio y su intervalo." : "Todos los participantes dieron el mismo valor: no hay variación para calcular el intervalo."}
          </p>
        )}
        <p className="text-sm text-muted">{reading(config)}</p>
        {a.secondary.length > 0 ? (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,260px)_1fr]">
            {a.secondary.map((s) => (
              <Row key={s.label} label={s.label}>
                <EstimateLine e={s} unit={a.unit} />
              </Row>
            ))}
          </dl>
        ) : null}
        {a.descriptive.length > 0 ? (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,260px)_1fr]">
            {a.descriptive.map((d) => (
              <Row key={d.label} label={d.label}>
                <span className="tabular-nums">{d.value}</span>
              </Row>
            ))}
          </dl>
        ) : null}
      </Card>

      {a.histogram.length > 0 ? <VariantHistogram rows={a.histogram} unitLabel={unit} /> : null}

      <Card className="space-y-3">
        <SectionTitle icon="alert">Calidad de los datos</SectionTitle>
        {a.nFlagged === 0 ? (
          <p className="text-sm">
            <StatusBadge tone="success">Sin advertencias</StatusBadge> <span className="text-muted">Ningún participante tiene advertencias de calidad.</span>
          </p>
        ) : (
          <>
            <p className="text-sm">
              <StatusBadge tone="warning">{a.nFlagged} con advertencias</StatusBadge>{" "}
              <span className="text-muted">No entran al promedio principal; siguen en el CSV con su motivo.</span>
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {a.flagCounts.map((f) => (
                <li key={f.flag}>
                  {FLAG_LABEL[f.flag] ?? f.flag}: <span className="tabular-nums">{f.count}</span>
                </li>
              ))}
            </ul>
            {a.primaryAll.mean !== null ? (
              <p className="text-sm text-muted">
                Si los incluyeras, la media sería <EstimateLine e={a.primaryAll} unit={a.unit} /> (n = {a.primaryAll.n}). Si la conclusión cambia, no confíes en ella sin revisar los datos.
              </p>
            ) : null}
          </>
        )}
        {a.devices.length > 0 ? (
          <p className="text-xs text-muted">Dispositivos: {a.devices.map((d) => `${d.deviceType} (${d.count})`).join(" · ")}</p>
        ) : null}
      </Card>

      <Alert tone="info">
        Los parámetros de la tarea y las reglas de puntuación siguen lo descrito en la literatura, pero no se han cotejado contra los datos de las publicaciones originales (ver Metodología). Una sola variante no basta para una conclusión sobre una marca: contrástala con otras mediciones.
      </Alert>
    </div>
  );
}
