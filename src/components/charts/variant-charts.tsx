"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistogramBin } from "@/tools/variants/results/aggregate";

const AXIS = { fill: "currentColor", fontSize: 12 } as const;
const tooltipStyle = { background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 };

/** Distribución de la medida principal entre los participantes que entran al promedio. */
export function VariantHistogram({ rows, unitLabel }: { rows: HistogramBin[]; unitLabel: string }) {
  return (
    <figure className="space-y-2">
      <figcaption>
        <p className="text-base font-semibold text-heading">Distribución de la medida principal ({unitLabel})</p>
        <p className="text-xs text-muted">Número de participantes por rango. La línea marca 0 (sin asociación o sin efecto).</p>
      </figcaption>
      <div className="text-muted" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barCategoryGap={1}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
            <XAxis dataKey="from" tick={AXIS} interval="preserveStartEnd" />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, p) => p?.[0]?.payload?.label ?? ""} formatter={(v) => [String(v), "Participantes"]} />
            <ReferenceLine x={0} stroke="currentColor" strokeOpacity={0.6} />
            <Bar dataKey="count" name="Participantes" fill="var(--chart-1)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
