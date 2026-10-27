"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { DEFAULT_THANK_YOU, MAX_WORDS_PER_POLE, MIN_WORDS_PER_POLE } from "@/tools/iat/config";
import { RadioCard, Recommendation, StepShell, WordsInput } from "@/tools/iat/wizard/ui";
import { VARIANT_INFO, defaultVariantConsent, variantsForConceptCount, type VariantConfig, type VariantId } from "../config";
import { defaultVariantConfig, withConceptCount, withVariant } from "../defaults";
import { buildPlan, estimateVariantMinutes, totalTrials } from "../plan";
import { createVariantStudy } from "./actions";
import { VARIANT_STEPS, validateVariantStep } from "./validation";

type Update = (patch: Partial<VariantConfig>) => void;

/** Número con etiqueta y la referencia de la literatura (para que el investigador sepa cuánto se aleja). */
function NumField({ label, hint, value, min, max, step = 1, onChange }: { label: string; hint: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <Field label={label} hint={hint}>
      <Input type="number" inputMode="numeric" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
    </Field>
  );
}

const PRACTICE_NOTE: Record<VariantId, string> = {
  sc_iat: "Una sola marca frente a lo bueno y lo malo. Dos bloques (marca con «bueno» y marca con «malo»), cada uno con práctica y prueba.",
  gnat: "El participante sólo responde ante la combinación objetivo y se abstiene ante el resto. Exige respuestas muy rápidas: mejor en computadora.",
  priming: "Un nombre aparece una fracción de segundo antes de cada palabra. Los tiempos de presentación dependen de la pantalla: mejor en computadora.",
};

export function VariantBuilder({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [config, setConfig] = useState<VariantConfig>(() => ({ ...defaultVariantConfig("sc_iat", 1), product: "" }));
  const [studyName, setStudyName] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [shown, setShown] = useState<{ config: VariantConfig; errors: string[] } | null>(null);
  const errors = shown && shown.config === config ? shown.errors : [];
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const step = VARIANT_STEPS[stepIndex];
  const isLast = stepIndex === VARIANT_STEPS.length - 1;
  const update: Update = (patch) => setConfig((c) => ({ ...c, ...patch }) as VariantConfig);
  const conceptCount = config.concepts.length === 2 ? 2 : 1;

  function goTo(index: number) {
    setShown(null);
    setStepIndex(index);
    if (VARIANT_STEPS[index].id === "texts") {
      setConfig((c) => ({ ...c, texts: { ...c.texts, consent: c.texts.consent || defaultVariantConsent(c.product) } }) as VariantConfig);
    }
    if (VARIANT_STEPS[index].id === "confirm") {
      setStudyName((n) => n || `${VARIANT_INFO[config.variant].short} · ${config.concepts.map((c) => c.label).join(" vs ")}`);
    }
  }

  function next() {
    const errs = validateVariantStep(step.id, config);
    setShown({ config, errors: errs });
    if (errs.length === 0) goTo(stepIndex + 1);
  }

  function submit() {
    const errs = validateVariantStep("confirm", config);
    if (!studyName.trim()) errs.push("Escribe un nombre para el estudio");
    setShown({ config, errors: errs });
    if (errs.length) return;
    setSubmitError(null);
    startTransition(async () => {
      // En éxito el server action redirige; sólo regresa si hubo error.
      const res = await createVariantStudy({ projectId, name: studyName.trim(), config });
      if (res?.error) setSubmitError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Proyecto: {projectName} · Paso {stepIndex + 1} de {VARIANT_STEPS.length} · {step.title}
      </p>

      <Card className="space-y-5">
        {step.id === "design" && (
          <DesignStep
            config={config}
            conceptCount={conceptCount}
            setConceptCount={(n) => setConfig((c) => withConceptCount(c, n))}
            setVariant={(v) => setConfig((c) => withVariant(c, v))}
            projectId={projectId}
          />
        )}
        {step.id === "content" && <ContentStep config={config} update={update} />}
        {step.id === "params" && <ParamsStep config={config} setConfig={setConfig} />}
        {step.id === "texts" && <TextsStep config={config} update={update} />}
        {step.id === "confirm" && <ConfirmStep config={config} studyName={studyName} setStudyName={setStudyName} />}

        {errors.length > 0 ? (
          <Alert tone="error">
            <ul className="space-y-1">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {submitError ? <Alert tone="error">{submitError}</Alert> : null}
      </Card>

      <div className="flex items-center justify-between">
        {stepIndex === 0 ? (
          <Link href={`/projects/${projectId}`} className="inline-block py-1 text-sm text-muted hover:underline">
            Cancelar
          </Link>
        ) : (
          <Button type="button" variant="secondary" onClick={() => goTo(stepIndex - 1)}>
            Atrás
          </Button>
        )}
        {isLast ? (
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Generando…" : "Generar estudio"}
          </Button>
        ) : (
          <Button type="button" onClick={next}>
            Continuar
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 1. Diseño
function DesignStep({
  config,
  conceptCount,
  setConceptCount,
  setVariant,
  projectId,
}: {
  config: VariantConfig;
  conceptCount: 1 | 2;
  setConceptCount: (n: 1 | 2) => void;
  setVariant: (v: VariantId) => void;
  projectId: string;
}) {
  const offered = variantsForConceptCount(conceptCount);
  return (
    <StepShell title="Paso 1 de 5" question="¿Cuántas marcas o conceptos vas a medir?">
      <div className="space-y-3">
        <RadioCard name="count" checked={conceptCount === 1} onChange={() => setConceptCount(1)} title="Una marca o concepto" badge="Sin comparación">
          Mide qué tan positiva o negativa es la asociación con esa marca, sin necesitar otra marca de referencia.
        </RadioCard>
        <RadioCard name="count" checked={conceptCount === 2} onChange={() => setConceptCount(2)} title="Dos marcas o conceptos">
          Compara dos marcas con Go/No-Go o priming.
        </RadioCard>
      </div>
      {conceptCount === 2 ? (
        <Recommendation>
          Para <strong>comparar directamente dos marcas</strong>, lo estándar es el{" "}
          <Link href={`/projects/${projectId}/studies/new/iat`} className="font-medium underline underline-offset-4">
            IAT clásico
          </Link>
          . Aquí cada marca se mide por separado y se comparan sus resultados.
        </Recommendation>
      ) : null}

      <h3 className="pt-2 font-medium">Variante</h3>
      <div className="space-y-3">
        {offered.map((v) => (
          <RadioCard
            key={v}
            name="variant"
            checked={config.variant === v}
            onChange={() => setVariant(v)}
            title={VARIANT_INFO[v].name}
            badge={conceptCount === 1 && v === "sc_iat" ? "Diseñado para una sola marca" : undefined}
          >
            {VARIANT_INFO[v].summary} {PRACTICE_NOTE[v]}
          </RadioCard>
        ))}
      </div>
      <p className="text-xs text-muted">
        Sólo se ofrecen las variantes que funcionan con {conceptCount === 1 ? "un concepto" : "dos conceptos"}
        {conceptCount === 2 ? " (el SC-IAT mide una sola categoría)" : ""}.
      </p>
    </StepShell>
  );
}

// ---------------------------------------------------------------- 2. Contenido
function ContentStep({ config, update }: { config: VariantConfig; update: Update }) {
  const attr = config.attribute;
  const setAttr = (patch: Partial<VariantConfig["attribute"]>) => update({ attribute: { ...attr, ...patch } });
  const setConcept = (i: number, label: string, extras: string[]) =>
    update({ concepts: config.concepts.map((c, j) => (j === i ? { label, stimuli: [label, ...extras] } : c)) });
  return (
    <StepShell title="Paso 2 de 5" question="¿Qué producto y qué marca(s)?">
      <Field label="Producto, servicio o categoría" hint='Ej. "café de especialidad", "bancos digitales".'>
        <Input value={config.product} maxLength={120} onChange={(e) => update({ product: e.target.value })} autoFocus />
      </Field>

      <div className={`grid gap-4 ${config.concepts.length === 2 ? "sm:grid-cols-2" : ""}`}>
        {config.concepts.map((concept, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-border p-4">
            <Field label={config.concepts.length === 2 ? `Concepto ${i === 0 ? "A" : "B"} (nombre exacto)` : "Marca o concepto (nombre exacto)"}>
              <Input value={concept.label} maxLength={40} onChange={(e) => setConcept(i, e.target.value, concept.stimuli.slice(1))} />
            </Field>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Estímulos adicionales (opcional)</span>
              <WordsInput
                ariaLabel={`Estímulos adicionales del concepto ${i + 1}`}
                value={concept.stimuli.slice(1)}
                onChange={(extras) => setConcept(i, concept.label, extras)}
                min={0}
                max={9}
                rows={3}
                resetKey={`c${i}`}
              />
              <span className="block text-xs text-muted">Otros textos que representen a la marca (p. ej. sus productos).</span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <Field label="Atributo que se evalúa" hint='Ej. "Confianza", "Calidad percibida".'>
          <Input value={attr.name} maxLength={60} onChange={(e) => setAttr({ name: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Field label="Polo positivo (nombre)">
              <Input value={attr.positiveLabel} maxLength={40} onChange={(e) => setAttr({ positiveLabel: e.target.value })} />
            </Field>
            <WordsInput ariaLabel="Palabras del polo positivo" value={attr.positiveWords} onChange={(w) => setAttr({ positiveWords: w })} min={MIN_WORDS_PER_POLE} max={MAX_WORDS_PER_POLE} resetKey="pos" />
          </div>
          <div className="space-y-2">
            <Field label="Polo negativo (nombre)">
              <Input value={attr.negativeLabel} maxLength={40} onChange={(e) => setAttr({ negativeLabel: e.target.value })} />
            </Field>
            <WordsInput ariaLabel="Palabras del polo negativo" value={attr.negativeWords} onChange={(w) => setAttr({ negativeWords: w })} min={MIN_WORDS_PER_POLE} max={MAX_WORDS_PER_POLE} resetKey="neg" />
          </div>
        </div>
        <Recommendation>
          Usa palabras cortas, de una sola idea y claramente buenas o malas. Ninguna puede coincidir con el nombre de la marca ni repetirse entre polos.
        </Recommendation>
      </div>
    </StepShell>
  );
}

// ---------------------------------------------------------------- 3. Parámetros
function ParamsStep({ config, setConfig }: { config: VariantConfig; setConfig: (fn: (c: VariantConfig) => VariantConfig) => void }) {
  const setParams = (patch: Record<string, number>) => setConfig((c) => ({ ...c, params: { ...c.params, ...patch } }) as VariantConfig);
  let fields: ReactNode;
  if (config.variant === "sc_iat") {
    const p = config.params;
    fields = (
      <>
        <NumField label="Ventana de respuesta (ms)" hint="Referencia: 1500 ms. Sin respuesta a tiempo cuenta como error." value={p.windowMs} min={800} max={3000} step={100} onChange={(n) => setParams({ windowMs: n })} />
        <NumField label="Ensayos de práctica por bloque" hint="Referencia: 24." value={p.practiceTrials} min={6} max={48} onChange={(n) => setParams({ practiceTrials: n })} />
        <NumField label="Ensayos de prueba por bloque" hint="Referencia: 72." value={p.testTrials} min={12} max={120} onChange={(n) => setParams({ testTrials: n })} />
      </>
    );
  } else if (config.variant === "gnat") {
    const p = config.params;
    fields = (
      <>
        <NumField label="Plazo para responder (ms)" hint="Rango habitual: 500–850 ms. La palabra desaparece al terminar el plazo." value={p.deadlineMs} min={400} max={1500} step={50} onChange={(n) => setParams({ deadlineMs: n })} />
        <NumField label="Ensayos por bloque de medición" hint="Número par; la mitad son señal y la mitad ruido." value={p.trialsPerBlock} min={20} max={80} step={2} onChange={(n) => setParams({ trialsPerBlock: n })} />
        <NumField label="Ensayos de práctica por bloque" hint="Con señal de error. 0 los omite." value={p.practiceTrials} min={0} max={16} onChange={(n) => setParams({ practiceTrials: n })} />
      </>
    );
  } else {
    const p = config.params;
    fields = (
      <>
        <NumField label="Duración del prime (ms)" hint="Referencia: SOA total de unos 300 ms (prime + blanco)." value={p.primeMs} min={30} max={500} step={10} onChange={(n) => setParams({ primeMs: n })} />
        <NumField label="Blanco entre prime y palabra (ms)" hint={`SOA actual: ${p.primeMs + p.blankMs} ms.`} value={p.blankMs} min={0} max={500} step={10} onChange={(n) => setParams({ blankMs: n })} />
        <NumField label="Tiempo máximo para clasificar (ms)" hint="Sin respuesta cuenta como error." value={p.maxResponseMs} min={800} max={4000} step={100} onChange={(n) => setParams({ maxResponseMs: n })} />
        <NumField label="Repeticiones de cada combinación" hint="Más repeticiones = más ensayos y estimaciones más estables." value={p.repetitions} min={1} max={4} onChange={(n) => setParams({ repetitions: n })} />
        <NumField label="Ensayos de práctica" hint="Con prime de control y señal de error. 0 los omite." value={p.practiceTrials} min={0} max={16} onChange={(n) => setParams({ practiceTrials: n })} />
      </>
    );
  }
  return (
    <StepShell title="Paso 3 de 5" question="Parámetros de la tarea">
      <div className="grid gap-4 sm:grid-cols-2">{fields}</div>
      <Alert tone="info">
        Los valores iniciales siguen lo descrito en la literatura, pero <strong>no se han cotejado contra los datos de las publicaciones originales</strong>. Si los cambias, tus
        resultados dejan de ser comparables con los de otros estudios con los valores de referencia.
      </Alert>
    </StepShell>
  );
}

// ---------------------------------------------------------------- 4. Textos
function TextsStep({ config, update }: { config: VariantConfig; update: Update }) {
  return (
    <StepShell title="Paso 4 de 5" question="Consentimiento, despedida y apariencia">
      <Field label="Texto de consentimiento" hint="El participante lo lee y acepta antes de empezar. Revísalo con tu comité o asesor legal si aplica.">
        <Textarea rows={8} value={config.texts.consent} maxLength={4000} onChange={(e) => update({ texts: { ...config.texts, consent: e.target.value } })} />
      </Field>
      <Field label="Mensaje de despedida">
        <Textarea rows={3} value={config.texts.thankYou || DEFAULT_THANK_YOU} maxLength={1000} onChange={(e) => update({ texts: { ...config.texts, thankYou: e.target.value } })} />
      </Field>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Si el participante usa celular o tableta</h3>
        <RadioCard name="device" checked={config.deviceNotice === "inform"} onChange={() => update({ deviceNotice: "inform" })} title="Avisar y dejar continuar" />
        <RadioCard name="device" checked={config.deviceNotice === "suggest_desktop"} onChange={() => update({ deviceNotice: "suggest_desktop" })} title="Sugerir con insistencia una computadora" />
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Color de acento</h3>
        <RadioCard name="theme" checked={config.theme.mode === "neutral"} onChange={() => update({ theme: { mode: "neutral" } })} title="Neutro (marca FRSKO)" />
        <RadioCard name="theme" checked={config.theme.mode === "custom"} onChange={() => update({ theme: { mode: "custom", accent: config.theme.accent ?? "#0a4a4c" } })} title="Color propio">
          {config.theme.mode === "custom" ? (
            <input type="color" aria-label="Color de acento" value={config.theme.accent ?? "#0a4a4c"} onChange={(e) => update({ theme: { mode: "custom", accent: e.target.value } })} className="mt-2 h-9 w-16" />
          ) : null}
        </RadioCard>
      </div>
    </StepShell>
  );
}

// ---------------------------------------------------------------- 5. Confirmar
function ConfirmStep({ config, studyName, setStudyName }: { config: VariantConfig; studyName: string; setStudyName: (s: string) => void }) {
  const summary = useMemo(() => {
    try {
      return { trials: totalTrials(buildPlan(config, "preview")), minutes: estimateVariantMinutes(config) };
    } catch {
      return null;
    }
  }, [config]);
  return (
    <StepShell title="Paso 5 de 5" question="Confirma y genera el estudio">
      <Field label="Nombre del estudio">
        <Input value={studyName} maxLength={160} onChange={(e) => setStudyName(e.target.value)} />
      </Field>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Variante</dt>
          <dd className="font-medium">{VARIANT_INFO[config.variant].name}</dd>
        </div>
        <div>
          <dt className="text-muted">Conceptos</dt>
          <dd className="font-medium">{config.concepts.map((c) => c.label).join(" · ")}</dd>
        </div>
        <div>
          <dt className="text-muted">Atributo</dt>
          <dd className="font-medium">
            {config.attribute.name}: {config.attribute.positiveLabel} / {config.attribute.negativeLabel}
          </dd>
        </div>
        {summary ? (
          <div>
            <dt className="text-muted">Duración</dt>
            <dd className="font-medium">
              {summary.trials} ensayos · unos {summary.minutes} min
            </dd>
          </div>
        ) : null}
      </dl>
      <Alert tone="info">
        Al generar el estudio se publica y recibes su liga. El servidor valida que los tiempos de cada ensayo tengan sentido y calcula las puntuaciones; los participantes con datos dudosos se marcan en los resultados en lugar de promediarse sin aviso.
      </Alert>
    </StepShell>
  );
}
