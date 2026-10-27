"use client";

import { useState } from "react";
import { Icon } from "@/components/brand/icon";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { SectionTitle } from "@/components/ui/section-title";
import {
  IAT_ASSUMED_SD,
  detectableEffectOneSample,
  detectableEffectTwoMeans,
  effectLabel,
  marginOfError,
  nOneSample,
  nProportion,
  nTwoMeans,
} from "@/lib/sample-size";

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
const pct = (x: number) => `${(x * 100).toFixed(1).replace(/\.0$/, "")} %`;

function Result({ value, unit, children }: { value: number | string; unit: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-neuro/10 p-4">
      <p className="font-display text-3xl font-bold leading-none text-neuro-deep tabular-nums">{value}</p>
      <p className="mt-1 text-sm font-medium text-heading">{unit}</p>
      {children ? <p className="mt-2 text-sm text-foreground">{children}</p> : null}
    </div>
  );
}

function Invalid({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">{children}</p>;
}

/** Cuántos participantes hacen falta para que un D medio de la magnitud dada salga distinto de cero. */
function IatPlanner() {
  const [meanD, setMeanD] = useState("0.2");
  const [sd, setSd] = useState(String(IAT_ASSUMED_SD));
  const [power, setPower] = useState("0.8");
  const m = num(meanD);
  const s = num(sd);
  const p = num(power);
  const ok = m > 0 && s > 0 && p > 0.5 && p < 0.99;
  const d = ok ? m / s : NaN;
  return (
    <Card className="space-y-4">
      <SectionTitle icon="neuro">IAT: ¿cuántos participantes para ver una asociación?</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="D medio que quieres poder detectar" hint="0.15 leve, 0.35 moderada, 0.65 fuerte (convención de Greenwald).">
          <Input inputMode="decimal" value={meanD} onChange={(e) => setMeanD(e.target.value)} />
        </Field>
        <Field label="Desviación típica de D" hint="Orientativa: en la literatura ronda 0.4.">
          <Input inputMode="decimal" value={sd} onChange={(e) => setSd(e.target.value)} />
        </Field>
        <Field label="Potencia" hint="Probabilidad de detectarlo si existe (0.80 es lo usual).">
          <Input inputMode="decimal" value={power} onChange={(e) => setPower(e.target.value)} />
        </Field>
      </div>
      {ok ? (
        <Result value={nOneSample(d, { power: p })} unit="participantes con datos válidos">
          Equivale a un efecto d = {d.toFixed(2)} ({effectLabel(d)}). Pide más: algunos participantes se excluyen por calidad de datos
          (suele ser 5 a 15 %).
        </Result>
      ) : (
        <Invalid>Escribe valores positivos; la potencia debe estar entre 0.5 y 0.99.</Invalid>
      )}
    </Card>
  );
}

function AbPlanner() {
  const [d, setD] = useState("0.5");
  const [power, setPower] = useState("0.8");
  const dv = num(d);
  const p = num(power);
  const ok = dv > 0 && p > 0.5 && p < 0.99;
  return (
    <Card className="space-y-4">
      <SectionTitle icon="target">Comparar dos grupos (prueba A/B, dos marcas, dos versiones)</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Diferencia que quieres detectar (d de Cohen)" hint="0.2 pequeña, 0.5 mediana, 0.8 grande.">
          <Input inputMode="decimal" value={d} onChange={(e) => setD(e.target.value)} />
        </Field>
        <Field label="Potencia">
          <Input inputMode="decimal" value={power} onChange={(e) => setPower(e.target.value)} />
        </Field>
      </div>
      {ok ? (
        <Result value={nTwoMeans(dv, { power: p })} unit="participantes por grupo">
          En total {2 * nTwoMeans(dv, { power: p })}. Los grupos deben formarse al azar y de tamaño parecido.
        </Result>
      ) : (
        <Invalid>Escribe una diferencia positiva y una potencia entre 0.5 y 0.99.</Invalid>
      )}
    </Card>
  );
}

function SurveyPlanner() {
  const [margin, setMargin] = useState("0.05");
  const [conf, setConf] = useState("0.95");
  const [pop, setPop] = useState("");
  const m = num(margin);
  const c = num(conf);
  const popN = num(pop);
  const ok = m > 0 && m < 0.5 && c > 0.5 && c < 0.999;
  return (
    <Card className="space-y-4">
      <SectionTitle icon="survey">Encuesta: ¿cuántas respuestas para un margen de error?</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Margen de error (±)" hint="0.05 = ± 5 puntos porcentuales.">
          <Input inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
        </Field>
        <Field label="Confianza">
          <Input inputMode="decimal" value={conf} onChange={(e) => setConf(e.target.value)} />
        </Field>
        <Field label="Tamaño de la población (opcional)" hint="Si es pequeña, como un grupo escolar.">
          <Input inputMode="numeric" value={pop} onChange={(e) => setPop(e.target.value)} placeholder="Sin límite" />
        </Field>
      </div>
      {ok ? (
        <Result value={nProportion({ margin: m, confidence: c, population: popN > 0 ? popN : undefined })} unit="respuestas completas">
          Calculado con el caso más conservador (50 / 50). Vale para porcentajes simples, como la proporción de promotores en un NPS.
        </Result>
      ) : (
        <Invalid>El margen debe estar entre 0 y 0.5 y la confianza entre 0.5 y 0.999.</Invalid>
      )}
    </Card>
  );
}

/** Lo contrario: dado un grupo, qué se puede concluir. Es la guía honesta para el aula. */
function GroupGuide() {
  const [n, setN] = useState("30");
  const nv = Math.floor(num(n));
  const ok = nv >= 2;
  const one = ok ? detectableEffectOneSample(nv) : null;
  const two = ok ? detectableEffectTwoMeans(Math.floor(nv / 2)) : null;
  const moe = ok ? marginOfError(nv) : NaN;
  return (
    <Card className="space-y-4">
      <SectionTitle icon="user">Ya tengo un grupo: ¿qué puedo concluir?</SectionTitle>
      <div className="max-w-xs">
        <Field label="Participantes disponibles">
          <Input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} />
        </Field>
      </div>
      {ok ? (
        <ul className="space-y-2 text-sm">
          <li>
            <strong>IAT o diferencia contra cero:</strong>{" "}
            {one === null ? "el grupo es demasiado pequeño para sacar una conclusión." : (
              <>sólo se detectan efectos de d ≥ {one.toFixed(2)} ({effectLabel(one)}). Un D medio de {(one * IAT_ASSUMED_SD).toFixed(2)} o menor puede ser azar.</>
            )}
          </li>
          <li>
            <strong>Dos grupos de {Math.floor(nv / 2)}:</strong>{" "}
            {two === null ? "demasiado pequeños." : <>sólo se detectan diferencias de d ≥ {two.toFixed(2)} ({effectLabel(two)}).</>}
          </li>
          <li>
            <strong>Un porcentaje de encuesta:</strong> tiene un margen de error de ± {pct(moe)}.
          </li>
          <li className="text-muted">
            Con grupos chicos úsalo como ejercicio o exploración, no como evidencia. Los mapas de atención con pocos participantes cambian
            mucho si repites el análisis con otra mitad de la muestra.
          </li>
        </ul>
      ) : (
        <Invalid>Escribe al menos 2 participantes.</Invalid>
      )}
    </Card>
  );
}

export function SampleCalculator() {
  return (
    <div className="space-y-5">
      <IatPlanner />
      <AbPlanner />
      <SurveyPlanner />
      <GroupGuide />
      <p className="flex items-start gap-2 text-xs text-muted">
        <Icon name="alert" className="size-5" />
        <span>
          Guías de planeación con aproximación normal: suponen datos aproximadamente normales, una prueba principal y respuestas completas.
          Ante duda, consulta a quien dirige la investigación.
        </span>
      </p>
    </div>
  );
}
