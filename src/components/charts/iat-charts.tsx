"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ConcordanceRow, DirectionRow, HistogramRow, MeanDRow } from "@/tools/iat/analysis/charts";

export const COLORS = {
  a: "var(--chart-1)",
  b: "var(--chart-2)",
  neutral: "var(--chart-4)",
  consistent: "var(--chart-3)",
  dissonant: "var(--chart-5)",
} as const;

const AXIS = { fill: "currentColor", fontSize: 12 } as const;
/** El texto de la leyenda va en tinta (el color de la serie está en la muestra), por contraste. */
const legendText = (value: string) => <span style={{ color: "var(--foreground)" }}>{value}</span>;
const GRID = "currentColor";
const tooltipStyle = { background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 };

function ChartFrame({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <figure className="space-y-2">
      <figcaption>
        <p className="text-base font-semibold text-heading">{title}</p>
        {caption ? <p className="text-xs text-muted">{caption}</p> : null}
      </figcaption>
      <div className="text-muted" style={{ height: 260 }}>
        {children}
      </div>
    </figure>
  );
}

export function MeanDChart({ rows }: { rows: MeanDRow[] }) {
  const extent = Math.max(0.5, ...rows.flatMap((row) => [Math.abs(row.low), Math.abs(row.high)]));
  const bound = Math.ceil(extent * 2) / 2;
  const scale = (value: number) => ((value + bound) / (2 * bound)) * 100;
  const valueText = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });

  return (
    <figure className="space-y-4" aria-label="D medio por dimensión">
      <figcaption className="space-y-1">
        <p className="font-bold">D medio por dimensión</p>
        <p className="text-sm text-muted">La banda representa el IC del 95 %. Si cruza cero, el intervalo incluye la ausencia de efecto (ns).</p>
      </figcaption>
      <div className="flex justify-between text-xs text-muted tabular-nums" aria-hidden="true">
        <span>{valueText.format(-bound)}</span><span>0</span><span>{valueText.format(bound)}</span>
      </div>
      <ul className="space-y-4">
        {rows.map(({ label, mean, low, high, n }) => {
          const crossesZero = low <= 0 && high >= 0;
          return (
            <li key={label} className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-semibold">{label}</span>
                <span className="text-xs text-muted tabular-nums">
                  D {valueText.format(mean)} · IC {valueText.format(low)} a {valueText.format(high)} · n = {n}{crossesZero ? " · ns" : ""}
                </span>
              </div>
              <div aria-hidden="true" className="relative h-7 rounded-md bg-surface-muted/55">
                <span className="absolute inset-y-0 left-1/2 border-l border-heading/50" />
                <span
                  className={`absolute inset-y-1 rounded-full bg-[linear-gradient(to_right,transparent,var(--chart-1),transparent)] ${crossesZero ? "opacity-50" : ""}`}
                  style={{ left: `${scale(low)}%`, width: `${scale(high) - scale(low)}%` }}
                />
                <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-heading" style={{ left: `${scale(mean)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export function HistogramChart({ title, rows }: { title: string; rows: HistogramRow[] }) {
  return (
    <ChartFrame title={title} caption="Número de participantes por rango de D (clases de 0.25).">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barCategoryGap={1}>
          <CartesianGrid stroke={GRID} strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="from" tick={AXIS} tickFormatter={(v: number) => v.toFixed(1)} interval={3} />
          <YAxis tick={AXIS} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, p) => p?.[0]?.payload?.range ?? ""} formatter={(v) => [String(v), "Participantes"]} />
          <ReferenceLine x={0} stroke="currentColor" strokeOpacity={0.6} />
          <Bar dataKey="count" name="Participantes" fill={COLORS.a} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

type StackRow = Record<string, string | number>;

function StackedPercent({
  title,
  caption,
  rows,
  series,
}: {
  title: string;
  caption: string;
  rows: StackRow[];
  series: { key: string; name: string; color: string }[];
}) {
  const height = Math.max(180, rows.length * 56 + 70);
  return (
    <figure className="space-y-2">
      <figcaption>
        <p className="text-base font-semibold text-heading">{title}</p>
        <p className="text-xs text-muted">{caption}</p>
      </figcaption>
      <div className="text-muted" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }} stackOffset="expand">
            <CartesianGrid stroke={GRID} strokeOpacity={0.12} horizontal={false} />
            <XAxis type="number" tick={AXIS} tickFormatter={(v: number) => `${Math.round(v * 100)} %`} />
            <YAxis type="category" dataKey="label" tick={AXIS} width={110} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${typeof v === "number" ? v : Number(v)} %`} />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} stackId="p" fill={s.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function DirectionChart({ rows, labelA, labelB }: { rows: DirectionRow[]; labelA: string; labelB: string }) {
  return (
    <StackedPercent
      title="Preferencia implícita por participante"
      caption="Porcentaje de participantes según hacia qué marca se inclina su D (|D| < 0.15 = sin preferencia clara)."
      rows={rows as unknown as StackRow[]}
      series={[
        { key: "A", name: `Favorece a ${labelA}`, color: COLORS.a },
        { key: "none", name: "Sin preferencia clara", color: COLORS.neutral },
        { key: "B", name: `Favorece a ${labelB}`, color: COLORS.b },
      ]}
    />
  );
}

export function ConcordanceChart({ rows }: { rows: ConcordanceRow[] }) {
  return (
    <StackedPercent
      title="Implícito vs. explícito"
      caption="Consistente: la asociación implícita y la preferencia declarada coinciden. Disonante: apuntan a marcas opuestas. Parcial: una de las dos es neutra."
      rows={rows as unknown as StackRow[]}
      series={[
        { key: "consistent", name: "Consistente", color: COLORS.consistent },
        { key: "partial", name: "Parcial", color: COLORS.neutral },
        { key: "dissonant", name: "Disonante", color: COLORS.dissonant },
      ]}
    />
  );
}
