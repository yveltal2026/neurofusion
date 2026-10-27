"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ConcordanceRow, DirectionRow, HistogramRow, MeanDRow } from "@/tools/iat/analysis/charts";

/**
 * Paleta apta para daltonismo (basada en Okabe–Ito). La marca A usa el morado de Neuro (luminancia baja) frente al
 * naranja de la B (luminancia alta): se distinguen también sin color. Las demás series siguen Okabe–Ito.
 */
export const COLORS = {
  a: "var(--chart-1)", // Neuro: morado en claro, lila en profundo (la marca A es la serie 1)
  b: "#E69F00",
  neutral: "#8c8c8c",
  consistent: "#009E73",
  dissonant: "#D55E00",
} as const;

const AXIS = { fill: "currentColor", fontSize: 12 } as const;
/** El texto de la leyenda va en tinta (el color de la serie está en la muestra), por contraste. */
const legendText = (value: string) => <span style={{ color: "var(--foreground)" }}>{value}</span>;
const GRID = "currentColor";
const tooltipStyle = { background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 };

function ChartFrame({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <figure className="space-y-2 rounded-lg border border-border p-4">
      <figcaption>
        <p className="text-sm font-medium">{title}</p>
        {caption ? <p className="text-xs text-muted">{caption}</p> : null}
      </figcaption>
      <div className="text-muted" style={{ height: 260 }}>
        {children}
      </div>
    </figure>
  );
}

export function MeanDChart({ rows }: { rows: MeanDRow[] }) {
  // Dominio simétrico y redondeado a 0.5 para que el cero quede centrado y las marcas sean limpias.
  const extent = Math.max(0.5, ...rows.flatMap((r) => [Math.abs(r.low), Math.abs(r.high)]));
  const bound = Math.ceil(extent * 2) / 2;
  return (
    <ChartFrame
      title="D medio por dimensión (IC 95 %)"
      caption="D > 0: la Marca A se asocia más al polo positivo; D < 0: la Marca B. Si el intervalo cruza 0 no hay evidencia de asociación."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} interval={0} />
          <YAxis tick={AXIS} domain={[-bound, bound]} ticks={[-bound, -bound / 2, 0, bound / 2, bound]} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => (typeof v === "number" ? v.toFixed(2) : String(v))} />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.6} />
          <Bar dataKey="mean" name="D medio" fill={COLORS.a} maxBarSize={56}>
            <ErrorBar dataKey="error" direction="y" stroke="#7a7a7a" strokeWidth={2} width={8} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
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
    <figure className="space-y-2 rounded-lg border border-border p-4">
      <figcaption>
        <p className="text-sm font-medium">{title}</p>
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
