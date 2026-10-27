import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { GgChart, VwChart } from "@/components/charts/price-charts";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import {
  getInstrument,
  type InstrumentAggregate,
  type ItemAggregate,
  type NumericSummary,
  type PriceAggregate,
  type SurveyAggregates,
  type SurveyConfig,
} from "../engine";

/** Muestra por debajo de la cual los intervalos son tan amplios que conviene decirlo. */
const SMALL_SAMPLE = 30;

const nf = (d: number) =>
  new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
const num = (n: number, d = 1) => nf(d).format(n);
const pct = (p: number, d = 0) => `${nf(d).format(p * 100)} %`;

function ci(range: [number, number] | null, d = 1): string {
  return range
    ? `IC95 % ${num(range[0], d)} a ${num(range[1], d)}`
    : "sin intervalo (n < 2)";
}

function Bar({
  value,
  label,
  detail,
}: {
  value: number;
  label: string;
  detail: string;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
      <span className="min-w-0 truncate" title={label}>
        {label}
      </span>
      <span className="text-right tabular-nums text-muted">{detail}</span>
      <div
        className="col-span-2 h-2 overflow-hidden rounded-full bg-foreground/10"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div>
      <dt className="font-display text-xs font-semibold text-muted">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function MeanLine({
  s,
  d = 1,
  of,
}: {
  s: NumericSummary | null;
  d?: number;
  of?: string;
}) {
  if (!s) return <span className="text-muted">sin datos</span>;
  return (
    <>
      {num(s.mean, d)}
      {of ? (
        <span className="text-base font-normal text-muted"> {of}</span>
      ) : null}
    </>
  );
}

function InstrumentCard({
  agg,
  subject,
}: {
  agg: InstrumentAggregate;
  subject: string | undefined;
}) {
  const def = getInstrument(agg.instrument);
  let body: ReactNode;

  switch (agg.instrument) {
    case "sus":
      body = (
        <dl className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Puntaje SUS (0–100)"
            value={<MeanLine s={agg.summary} of="de 100" />}
            hint={agg.summary ? ci(agg.summary.ci95) : undefined}
          />
          <Stat
            label="Referencia"
            value={num(agg.benchmark, 0)}
            hint="Promedio publicado de SUS (orientativo)"
          />
          <Stat
            label="Consistencia (α de Cronbach)"
            value={agg.alpha === null ? "—" : num(agg.alpha, 2)}
            hint={
              agg.alpha === null
                ? "Se calcula con 2 o más respuestas"
                : "Cerca de 0,7 o más suele considerarse aceptable"
            }
          />
        </dl>
      );
      break;
    case "nps": {
      const s = agg.summary;
      body = s ? (
        <div className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="NPS (−100 a 100)"
              value={num(s.nps, 0)}
              hint={`IC95 % ${num(s.ci95[0], 0)} a ${num(s.ci95[1], 0)}`}
            />
          </dl>
          <ul className="space-y-3">
            <Bar
              value={s.promoters / s.n}
              label="Promotores (9–10)"
              detail={`${s.promoters} · ${pct(s.promoters / s.n)}`}
            />
            <Bar
              value={s.passives / s.n}
              label="Pasivos (7–8)"
              detail={`${s.passives} · ${pct(s.passives / s.n)}`}
            />
            <Bar
              value={s.detractors / s.n}
              label="Detractores (0–6)"
              detail={`${s.detractors} · ${pct(s.detractors / s.n)}`}
            />
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted">Sin respuestas completas.</p>
      );
      break;
    }
    case "sam":
      body = (
        <dl className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Valencia (1–9)"
            value={<MeanLine s={agg.valence} />}
            hint={agg.valence ? ci(agg.valence.ci95) : undefined}
          />
          <Stat
            label="Activación (1–9)"
            value={<MeanLine s={agg.arousal} />}
            hint={agg.arousal ? ci(agg.arousal.ci95) : undefined}
          />
          <Stat
            label="Dominancia (1–9)"
            value={<MeanLine s={agg.dominance} />}
            hint={agg.dominance ? ci(agg.dominance.ci95) : undefined}
          />
        </dl>
      );
      break;
    case "purchase_intent":
      body = (
        <div className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Stat
              label="Dos categorías superiores"
              value={agg.topTwoBox ? pct(agg.topTwoBox.pct) : "—"}
              hint={
                agg.topTwoBox
                  ? `${agg.topTwoBox.count} de ${agg.n} · IC95 % ${pct(agg.topTwoBox.ci95[0])} a ${pct(agg.topTwoBox.ci95[1])}`
                  : undefined
              }
            />
            <Stat label="Media (1–5)" value={<MeanLine s={agg.summary} />} />
          </dl>
          <ul className="space-y-3">
            {agg.distribution.map((d, i) => (
              <Bar
                key={d.value}
                value={agg.n ? d.count / agg.n : 0}
                label={def.scaleLabels?.[i] ?? String(d.value)}
                detail={`${d.count} · ${agg.n ? pct(d.count / agg.n) : "—"}`}
              />
            ))}
          </ul>
          <p className="text-xs text-muted">
            La intención declarada suele sobreestimar la compra real: no es un
            pronóstico de ventas.
          </p>
        </div>
      );
      break;
    case "attitude":
      body = (
        <dl className="grid gap-4 sm:grid-cols-2">
          <Stat
            label="Actitud (1–7)"
            value={<MeanLine s={agg.summary} />}
            hint={agg.summary ? ci(agg.summary.ci95) : undefined}
          />
          <Stat
            label="Consistencia (α de Cronbach)"
            value={agg.alpha === null ? "—" : num(agg.alpha, 2)}
            hint={
              agg.alpha === null
                ? "Se calcula con 2 o más respuestas"
                : undefined
            }
          />
        </dl>
      );
      break;
  }

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-medium">
          {def.name}
          {subject ? (
            <span className="font-normal text-muted"> · {subject}</span>
          ) : null}
        </h3>
        <p className="text-xs text-muted">
          {agg.n} {agg.n === 1 ? "respuesta completa" : "respuestas completas"}{" "}
          · evidencia: autorreporte medido
        </p>
      </div>
      {body}
      <details className="text-xs text-muted">
        <summary className="cursor-pointer py-1">
          Fuente y notas del instrumento
        </summary>
        <p className="mt-1">{def.source}</p>
        <p className="mt-1">{def.notes}</p>
        <p className="mt-1">Versión del instrumento: {def.version}</p>
      </details>
    </Card>
  );
}

function ItemCard({ item }: { item: ItemAggregate }) {
  let body: ReactNode;
  if (item.type === "select" || item.type === "multiselect") {
    body = (
      <ul className="space-y-3">
        {item.options.map((o) => (
          <Bar
            key={o.option}
            value={o.pct}
            label={o.option}
            detail={`${o.count} · ${pct(o.pct)}`}
          />
        ))}
      </ul>
    );
  } else if (item.type === "scale") {
    const max = Math.max(1, ...item.distribution.map((d) => d.count));
    body = (
      <div className="space-y-3">
        {item.summary ? (
          <p className="text-sm">
            Media{" "}
            <strong className="tabular-nums">
              {num(item.summary.mean, 2)}
            </strong>{" "}
            <span className="text-muted">({ci(item.summary.ci95, 2)})</span>
          </p>
        ) : null}
        <ul className="space-y-3">
          {item.distribution.map((d) => (
            <Bar
              key={d.value}
              value={d.count / max}
              label={String(d.value)}
              detail={String(d.count)}
            />
          ))}
        </ul>
      </div>
    );
  } else if (item.type === "number") {
    body = item.summary ? (
      <p className="text-sm">
        Media{" "}
        <strong className="tabular-nums">{num(item.summary.mean, 2)}</strong>
        {item.summary.sd !== null ? (
          <> · desviación {num(item.summary.sd, 2)}</>
        ) : null}{" "}
        · mínimo {num(item.summary.min, 2)} · máximo {num(item.summary.max, 2)}
      </p>
    ) : (
      <p className="text-sm text-muted">Sin respuestas.</p>
    );
  } else {
    body = (
      <p className="text-sm text-muted">
        {item.n} respuestas escritas. Los textos libres se leen en el CSV; no se
        envían a la IA.
      </p>
    );
  }
  return (
    <Card className="space-y-3">
      <div>
        <h3 className="font-medium">{item.label}</h3>
        <p className="text-xs text-muted">
          {item.n} {item.n === 1 ? "respuesta" : "respuestas"}
        </p>
      </div>
      {body}
    </Card>
  );
}

function PriceCard({ agg, subject }: { agg: PriceAggregate; subject?: string }) {
  const { result } = agg;
  const money = (v: number | null) => (v === null ? "—" : `${num(v, v % 1 === 0 ? 0 : 2)} ${agg.currency}`);
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-medium">
          {agg.method === "van_westendorp" ? "Sensibilidad al precio (Van Westendorp)" : "Curva de demanda (Gabor-Granger)"}
        </h3>
        <p className="text-xs text-muted">
          {result.n} {result.n === 1 ? "respuesta válida" : "respuestas válidas"}
          {subject ? ` · ${subject}` : ""}
        </p>
      </div>
      {agg.method === "van_westendorp" ? (
        <>
          {agg.result.curves.length ? <VwChart curves={agg.result.curves} optimal={agg.result.opp} currency={agg.currency} /> : null}
          <dl className="grid gap-4 sm:grid-cols-4">
            <Stat label="Muy barato × no es barato (PMC)" value={money(agg.result.pmc)} />
            <Stat label="Precio óptimo (OPP)" value={money(agg.result.opp)} />
            <Stat label="Indiferencia (IPP)" value={money(agg.result.ipp)} />
            <Stat label="Demasiado caro × no es caro (PME)" value={money(agg.result.pme)} />
          </dl>
          {agg.result.pmc !== null && agg.result.pme !== null ? (
            <p className="text-sm">
              Rango aceptable: <strong>{money(agg.result.pmc)}</strong> a <strong>{money(agg.result.pme)}</strong>.
            </p>
          ) : null}
        </>
      ) : (
        <>
          {agg.result.points.length ? <GgChart points={agg.result.points} currency={agg.currency} /> : null}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="font-display text-xs font-semibold text-muted">
                <tr>
                  <th className="px-3 py-2">Precio</th>
                  <th className="px-3 py-2">Compraría</th>
                  <th className="px-3 py-2">IC95 %</th>
                  <th className="px-3 py-2">Ingreso por persona</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agg.result.points.map((p) => (
                  <tr key={p.price} className={p.price === agg.result.optimalPrice ? "bg-primary/10 font-medium" : undefined}>
                    <td className="px-3 py-2 tabular-nums">{money(p.price)}</td>
                    <td className="px-3 py-2 tabular-nums">{pct(p.share)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {pct(p.ci95[0])} a {pct(p.ci95[1])}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{num(p.revenue, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {agg.result.optimalPrice !== null ? (
            <p className="text-sm">
              Precio que maximiza el ingreso entre los probados: <strong>{money(agg.result.optimalPrice)}</strong>.
            </p>
          ) : null}
        </>
      )}
      {agg.result.warnings.length ? (
        <ul className="space-y-2">
          {agg.result.warnings.map((w) => (
            <li key={w}>
              <Alert tone="warning">{w}</Alert>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

export function SurveyResultsView({
  config,
  aggregates,
}: {
  config: SurveyConfig;
  aggregates: SurveyAggregates;
}) {
  const subjects = new Map(
    config.blocks.map((b) => [
      b.id,
      b.kind === "instrument" || b.kind === "price" ? b.subject : undefined,
    ]),
  );
  const excluded = aggregates.nTotal - aggregates.nIncluded;

  return (
    <div className="space-y-6">
      <Card>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Respuestas en el análisis"
            value={aggregates.nIncluded}
          />
          <Stat label="Excluidas" value={excluded} />
          <Stat
            label="Versión del motor"
            value={
              <span className="text-base">{aggregates.engineVersion}</span>
            }
          />
        </dl>
      </Card>

      {aggregates.nIncluded === 0 ? (
        <Alert>
          Aún no hay respuestas completas. Comparte la liga para empezar a
          recibirlas.
        </Alert>
      ) : null}
      {aggregates.nIncluded > 0 && aggregates.nIncluded < SMALL_SAMPLE ? (
        <Alert tone="warning">
          Muestra pequeña ({aggregates.nIncluded} respuestas): los intervalos de
          confianza son amplios y las diferencias pequeñas pueden ser azar.
          Úsalo como exploración, no como conclusión.
        </Alert>
      ) : null}

      {aggregates.instruments.length ? (
        <section className="space-y-4" aria-label="Instrumentos">
          <h2 className="text-lg font-semibold">Instrumentos</h2>
          {aggregates.instruments.map((agg) => (
            <InstrumentCard
              key={agg.blockId}
              agg={agg}
              subject={subjects.get(agg.blockId)}
            />
          ))}
        </section>
      ) : null}

      {aggregates.prices.length ? (
        <section className="space-y-4" aria-label="Precio">
          <SectionTitle icon="target" className="text-lg font-semibold">
            Precio
          </SectionTitle>
          {aggregates.prices.map((agg) => (
            <PriceCard key={agg.blockId} agg={agg} subject={subjects.get(agg.blockId)} />
          ))}
        </section>
      ) : null}

      {aggregates.items.length ? (
        <section className="space-y-4" aria-label="Preguntas">
          <h2 className="text-lg font-semibold">Preguntas</h2>
          {aggregates.items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
