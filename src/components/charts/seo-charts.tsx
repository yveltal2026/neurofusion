"use client";

import { scoreColor } from "./score-color";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS = { fill: "currentColor", fontSize: 12 } as const;
const tooltipStyle = { background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 };

function Frame({ title, caption, height = 240, children }: { title: string; caption?: string; height?: number; children: React.ReactNode }) {
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


export function CategoryScoreChart({ rows }: { rows: { label: string; score: number }[] }) {
  return (
    <Frame title="Puntuación por categoría" caption="0–100. Promedio ponderado de las reglas de cada categoría." height={Math.max(200, rows.length * 30 + 40)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.12} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={AXIS} />
          <YAxis type="category" dataKey="label" tick={AXIS} width={140} interval={0} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="score" name="Puntuación" maxBarSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="score" position="right" fill="var(--foreground)" fontSize={12} />
            {rows.map((r) => (
              <Cell key={r.label} fill={scoreColor(r.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function ScoreTrendChart({ rows }: { rows: { label: string; score: number }[] }) {
  return (
    <Frame title="Evolución de la puntuación" caption="Una barra por auditoría guardada en este estudio." height={200}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} />
          <YAxis domain={[0, 100]} tick={AXIS} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line dataKey="score" name="Puntuación" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  );
}
