"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS = { fill: "currentColor", fontSize: 12 } as const;
/** El texto de la leyenda va en tinta (el color de la serie está en la muestra), por contraste. */
const legendText = (value: string) => <span style={{ color: "var(--foreground)" }}>{value}</span>;
const tooltipStyle = { background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 };
/** Paleta categórica de marca (globals.css). Posición fija: el color sigue al sitio, no a su rango. */
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
export const seriesColor = (index: number) => SERIES[index % SERIES.length];

function Frame({ title, caption, height = 260, children }: { title: string; caption?: string; height?: number; children: React.ReactNode }) {
  return (
    <figure className="space-y-2 rounded-lg border border-border p-4 break-inside-avoid">
      <figcaption>
        <p className="text-sm font-medium">{title}</p>
        {caption ? <p className="text-xs text-muted">{caption}</p> : null}
      </figcaption>
      <div className="text-muted" style={{ height }}>
        {children}
      </div>
    </figure>
  );
}

/** Cada barra lleva el color de su sitio (igual que en las demás gráficas) y la lectura en texto. */
export function IfdChart({ rows }: { rows: { site: string; ifd: number; reading: string; colorIndex: number }[] }) {
  return (
    <Frame title="IFD por sitio" caption="0–100; menor es mejor. Cortes: < 20 baja · < 35 media · < 50 alta · ≥ 50 crítica.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows.map((r) => ({ ...r, labelText: `${r.ifd.toFixed(1)} · ${r.reading}` }))} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="site" tick={AXIS} interval={0} />
          <YAxis domain={[0, 100]} tick={AXIS} />
          <Tooltip contentStyle={tooltipStyle} />
          {[20, 35, 50].map((y) => (
            <ReferenceLine key={y} y={y} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="4 4" />
          ))}
          <Bar
            dataKey="ifd"
            name="IFD"
            maxBarSize={64}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          >
            <LabelList dataKey="labelText" position="top" fill="var(--foreground)" fontSize={12} />
            {rows.map((r) => (
              <Cell key={r.site} fill={seriesColor(r.colorIndex)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function TaskSuccessChart({ rows, sites }: { rows: Record<string, string | number>[]; sites: { name: string; colorIndex: number }[] }) {
  return (
    <Frame title="Éxito estimado por tarea (%)" caption="Estimación modelada a partir de las calificaciones del analista.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="task" tick={AXIS} interval={0} />
          <YAxis domain={[0, 100]} tick={AXIS} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          {sites.map((s) => (
            <Bar key={s.name} dataKey={s.name} fill={seriesColor(s.colorIndex)} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}

/** Tornado: cuánto cambia el IFD si cada calificación baja/sube 0.1. */
export function SensitivityChart({ rows, title }: { rows: { label: string; down: number; up: number }[]; title: string }) {
  return (
    <Frame title={title} caption="Cambio del IFD (puntos) si la calificación baja o sube 0.1 (login: no ↔ sí). Muestra qué juicios dominan el índice." height={Math.max(220, rows.length * 34 + 70)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" stackOffset="sign" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.12} horizontal={false} />
          <XAxis type="number" tick={AXIS} />
          <YAxis type="category" dataKey="label" tick={AXIS} width={180} interval={0} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => (typeof v === "number" ? v.toFixed(1) : String(v))} />
          <ReferenceLine x={0} stroke="currentColor" />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          <Bar dataKey="down" name="Calificación −0.1" fill="var(--chart-2)" isAnimationActive={false} />
          <Bar dataKey="up" name="Calificación +0.1" fill="var(--chart-1)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}
