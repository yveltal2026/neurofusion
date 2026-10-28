"use client";

import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GgPoint, VwCurvePoint } from "@/tools/survey/engine/price";

const AXIS = { fill: "currentColor", fontSize: 12 } as const;
const tooltipStyle = { background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 };

function Frame({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <figure className="space-y-2 break-inside-avoid">
      <figcaption>
        <p className="text-base font-semibold text-heading">{title}</p>
        <p className="text-xs text-muted">{caption}</p>
      </figcaption>
      <div className="text-muted" style={{ height: 280 }}>
        {children}
      </div>
    </figure>
  );
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Curvas de Van Westendorp. El color sigue a cada curva (posición fija); las cifras exactas van en la tabla de abajo. */
export function VwChart({ curves, optimal, currency }: { curves: VwCurvePoint[]; optimal: number | null; currency: string }) {
  return (
    <Frame title="Curvas de sensibilidad al precio" caption={`Porcentaje de participantes según el precio (${currency}). Los cruces definen el rango aceptable.`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={curves} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="price" type="number" domain={["dataMin", "dataMax"]} tick={AXIS} />
          <YAxis domain={[0, 1]} tickFormatter={pct} tick={AXIS} width={48} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => pct(Number(v))} labelFormatter={(l) => `${l} ${currency}`} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--foreground)" }} />
          <Line type="stepAfter" dataKey="tooCheap" name="Muy barato" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="notCheap" name="No es barato" stroke="var(--chart-3)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="notExpensive" name="No es caro" stroke="var(--chart-4)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="tooExpensive" name="Demasiado caro" stroke="var(--chart-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
          {optimal !== null ? <ReferenceLine x={optimal} stroke="var(--foreground)" strokeDasharray="4 4" /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}

/** Curva de demanda (proporción que compraría) y su ingreso esperado por persona. */
export function GgChart({ points, currency }: { points: GgPoint[]; currency: string }) {
  return (
    <Frame title="Demanda declarada e ingreso esperado" caption={`Proporción que compraría a cada precio (${currency}) y precio × proporción.`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="price" tick={AXIS} />
          <YAxis yAxisId="share" domain={[0, 1]} tickFormatter={pct} tick={AXIS} width={48} />
          <YAxis yAxisId="rev" orientation="right" tick={AXIS} width={48} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--foreground)" }} />
          <Line yAxisId="share" dataKey="share" name="Compraría" stroke="var(--chart-1)" strokeWidth={2} isAnimationActive={false} />
          <Line yAxisId="rev" dataKey="revenue" name="Ingreso por persona" stroke="var(--chart-4)" strokeWidth={2} strokeDasharray="5 3" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Frame>
  );
}
