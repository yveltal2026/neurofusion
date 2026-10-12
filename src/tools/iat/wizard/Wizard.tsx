"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  DEFAULT_THANK_YOU,
  GENDER_OPTIONS,
  LIKERT_DEFAULT_POINTS,
  LIKERT_MAX_POINTS,
  LIKERT_MIN_POINTS,
  LIKERT_PRESETS,
  MAX_DIMENSIONS,
  MAX_EXTRA_FIELDS,
  MAX_WORDS_PER_POLE,
  MIN_WORDS_PER_POLE,
  NEUTRAL_OPTION_LABEL,
  defaultConsentText,
  defaultIatConfig,
  normalizeWord,
  parseLines,
  slugify,
  type ExtraField,
  type IatConfig,
  type IatDimension,
} from "../config";
import { estimateMinutes, trialsPerDimension } from "../engine/protocol";
import { EXAMPLE_DIMENSIONS, suggestWords } from "../suggestions";
import { createIatStudy } from "./actions";
import { StartGate } from "./StartGate";
import { Recommendation, RadioCard, StepShell, WordsInput } from "./ui";
import { WIZARD_STEPS, validateStep } from "./validation";

const COMPARISON_PRESETS = {
  two_brands: "",
  brand_vs_category: "Otras marcas",
  brand_vs_ideal: "La marca ideal",
} as const;

function uniqueId(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let i = 2;
  while (taken.includes(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function Wizard({ projectId, projectName, aiAvailable = false }: { projectId: string; projectName: string; aiAvailable?: boolean }) {
  const [config, setConfig] = useState<IatConfig>(defaultIatConfig);
  const [studyName, setStudyName] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  // Los errores sólo se muestran mientras la configuración no cambie (al editar, se limpian solos).
  const [shown, setShown] = useState<{ config: IatConfig; errors: string[] } | null>(null);
  const errors = shown && shown.config === config ? shown.errors : [];
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Sube cuando se carga una sugerencia para que WordsInput recargue su texto.
  const [wordsVersion, setWordsVersion] = useState(0);
  // Antes del paso 1 se elige cómo diseñar el estudio: manualmente o asistido por IA.
  const [started, setStarted] = useState(false);
  const [aiNotes, setAiNotes] = useState<string | null>(null);

  const step = WIZARD_STEPS[stepIndex];
  const isLast = stepIndex === WIZARD_STEPS.length - 1;
  const update = (patch: Partial<IatConfig>) => setConfig((c) => ({ ...c, ...patch }));

  function goTo(index: number) {
    setShown(null);
    setStepIndex(index);
    if (WIZARD_STEPS[index].id === "confirm") {
      setConfig((c) => ({
        ...c,
        texts: { ...c.texts, consent: c.texts.consent || defaultConsentText(c.product) },
      }));
      setStudyName((n) => n || `${config.conceptA.label} vs ${config.conceptB.label}`);
    }
  }

  function next() {
    const errs = validateStep(step.id, config);
    setShown({ config, errors: errs });
    if (errs.length === 0) goTo(stepIndex + 1);
  }

  function submit() {
    const errs = validateStep("confirm", config);
    if (!studyName.trim()) errs.push("Escribe un nombre para el estudio");
    setShown({ config, errors: errs });
    if (errs.length) return;
    setSubmitError(null);
    startTransition(async () => {
      // En éxito el server action redirige; sólo regresa si hubo error.
      const res = await createIatStudy({ projectId, name: studyName.trim(), config });
      if (res?.error) setSubmitError(res.error);
    });
  }

  const trials = trialsPerDimension(config.protocol);
  const minutes = estimateMinutes(config.protocol, Math.max(1, config.dimensions.length));

  if (!started) {
    return (
      <StartGate
        projectName={projectName}
        projectId={projectId}
        aiAvailable={aiAvailable}
        onManual={() => setStarted(true)}
        onSuggested={(patch, notes) => {
          setConfig((c) => ({ ...c, ...patch }));
          setWordsVersion((v) => v + 1);
          setAiNotes(notes || "Revisa la propuesta y ajústala a tu estudio.");
          setStarted(true);
        }}
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Pasos" className="hidden lg:block">
        <ol className="space-y-1">
          {WIZARD_STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={i > stepIndex}
                onClick={() => goTo(i)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                  i === stepIndex ? "bg-primary/10 font-medium" : i < stepIndex ? "hover:bg-foreground/5" : "text-muted"
                }`}
              >
                <span
                  className={`flex size-5 items-center justify-center rounded-full text-xs ${
                    i <= stepIndex ? "bg-primary text-primary-foreground" : "border border-border"
                  }`}
                >
                  {i < stepIndex ? "✓" : i + 1}
                </span>
                {s.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-6">
        <p className="text-sm text-muted lg:hidden">
          Paso {stepIndex + 1} de {WIZARD_STEPS.length} · {step.title}
        </p>
        <p className="text-xs text-muted">Proyecto: {projectName}</p>

        <Card className="space-y-5">
          {aiNotes && ["product", "concepts", "dimensions", "words"].includes(step.id) ? (
            <Alert tone="info">
              <p className="font-medium">Propuesta generada por IA — revísala y edítala libremente.</p>
              <p className="mt-1">{aiNotes}</p>
            </Alert>
          ) : null}
          {step.id === "product" && <ProductStep config={config} update={update} />}
          {step.id === "concepts" && <ConceptsStep config={config} update={update} />}
          {step.id === "dimensions" && (
            <DimensionsStep config={config} update={update} trials={trials} bumpWords={() => setWordsVersion((v) => v + 1)} />
          )}
          {step.id === "words" && <WordsStep config={config} update={update} version={wordsVersion} bump={() => setWordsVersion((v) => v + 1)} />}
          {step.id === "protocol" && <ProtocolStep config={config} update={update} />}
          {step.id === "participant" && <ParticipantStep config={config} update={update} />}
          {step.id === "theme" && <ThemeStep config={config} update={update} />}
          {step.id === "confirm" && (
            <ConfirmStep
              config={config}
              update={update}
              studyName={studyName}
              setStudyName={setStudyName}
              trials={trials}
              minutes={minutes}
            />
          )}

          {errors.length > 0 ? (
            <Alert tone="error">
              <ul className="list-disc space-y-0.5 pl-4">
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
            <Link href={`/projects/${projectId}`} className="text-sm text-muted hover:underline">
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
    </div>
  );
}

type StepProps = { config: IatConfig; update: (patch: Partial<IatConfig>) => void };

// ---------------------------------------------------------------- 1. Producto
function ProductStep({ config, update }: StepProps) {
  return (
    <StepShell title="Paso 1 de 7" question="¿Qué producto, servicio o categoría quieres estudiar?">
      <Field label="Producto, servicio o categoría" hint='Ej. "café de especialidad", "bancos digitales", "tenis deportivos".'>
        <Input value={config.product} maxLength={120} onChange={(e) => update({ product: e.target.value })} autoFocus />
      </Field>
      <Recommendation>
        Sé específico: «café de especialidad» da un estudio más limpio que «bebidas». Esto da contexto a las siguientes
        decisiones.
      </Recommendation>
    </StepShell>
  );
}

// ---------------------------------------------------------------- 2. Conceptos
function ConceptsStep({ config, update }: StepProps) {
  function setConcept(key: "conceptA" | "conceptB", label: string, extras: string[]) {
    update({ [key]: { label, stimuli: [label, ...extras] } } as Partial<IatConfig>);
  }
  const labelB = config.conceptB.label;
  const presetValues = Object.values(COMPARISON_PRESETS);

  function pickComparison(comparison: IatConfig["comparison"]) {
    const preset = COMPARISON_PRESETS[comparison];
    const canOverwrite = !labelB || presetValues.includes(labelB as (typeof presetValues)[number]);
    const patch: Partial<IatConfig> = { comparison };
    if (canOverwrite) patch.conceptB = { label: preset, stimuli: [preset] };
    update(patch);
  }

  return (
    <StepShell title="Paso 2 de 7" question="¿Qué conceptos vas a comparar?">
      <div className="space-y-3">
        <RadioCard
          name="comparison"
          checked={config.comparison === "two_brands"}
          onChange={() => pickComparison("two_brands")}
          title="Dos marcas específicas"
          badge="Recomendado"
        >
          El diseño más limpio y replicable dentro de la categoría.
        </RadioCard>
        <RadioCard
          name="comparison"
          checked={config.comparison === "brand_vs_category"}
          onChange={() => pickComparison("brand_vs_category")}
          title="Una marca vs. la categoría / competencia agregada"
        />
        <RadioCard
          name="comparison"
          checked={config.comparison === "brand_vs_ideal"}
          onChange={() => pickComparison("brand_vs_ideal")}
          title="Una marca vs. la «marca ideal» o aspiracional"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["conceptA", "conceptB"] as const).map((key, i) => {
          const concept = config[key];
          return (
            <div key={key} className="space-y-3 rounded-lg border border-border p-4">
              <Field label={`Concepto ${i === 0 ? "A" : "B"} (nombre exacto)`}>
                <Input
                  value={concept.label}
                  maxLength={40}
                  onChange={(e) => setConcept(key, e.target.value, concept.stimuli.slice(1))}
                />
              </Field>
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Estímulos adicionales (opcional)</span>
                <WordsInput
                  ariaLabel={`Estímulos adicionales del concepto ${i === 0 ? "A" : "B"}`}
                  value={concept.stimuli.slice(1)}
                  onChange={(extras) => setConcept(key, concept.label, extras)}
                  min={0}
                  max={9}
                  rows={3}
                  resetKey={key}
                />
                <span className="block text-xs text-muted">Otros textos que representen al concepto (p. ej. sus productos).</span>
              </div>
            </div>
          );
        })}
      </div>
      <Recommendation>
        Usa los nombres tal como los reconocen los participantes. Comparar dos marcas específicas hace los resultados
        más fáciles de interpretar y de replicar.
      </Recommendation>
    </StepShell>
  );
}

// ---------------------------------------------------------------- 3. Dimensiones
function DimensionsStep({
  config,
  update,
  trials,
  bumpWords,
}: StepProps & { trials: number; bumpWords: () => void }) {
  function setDimension(index: number, patch: Partial<IatDimension>) {
    update({ dimensions: config.dimensions.map((d, i) => (i === index ? { ...d, ...patch } : d)) });
  }

  function addDimension(preset?: { name: string; positiveLabel: string; negativeLabel: string }) {
    if (config.dimensions.length >= MAX_DIMENSIONS) return;
    const name = preset?.name ?? "";
    const id = uniqueId(slugify(name, `dimension_${config.dimensions.length + 1}`), config.dimensions.map((d) => d.id));
    const words = preset ? suggestWords(preset.positiveLabel, preset.negativeLabel) : null;
    update({
      dimensions: [
        ...config.dimensions,
        {
          id,
          name,
          positiveLabel: preset?.positiveLabel ?? "",
          negativeLabel: preset?.negativeLabel ?? "",
          positiveWords: words?.positiveWords ?? [],
          negativeWords: words?.negativeWords ?? [],
        },
      ],
    });
    bumpWords();
  }

  const count = config.dimensions.length;
  return (
    <StepShell title="Paso 3 de 7" question="¿Qué dimensiones de atributos quieres medir?">
      <p className="text-sm text-muted">
        Cada dimensión es un par de polos (positivo / negativo). El <strong>polo positivo</strong> es el que favorecería a
        una marca si se asocia a ella.
      </p>

      <div className="space-y-4">
        {config.dimensions.map((d, i) => (
          <div key={d.id} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Dimensión {i + 1}</span>
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-2 text-red-600"
                onClick={() => update({ dimensions: config.dimensions.filter((_, j) => j !== i) })}
              >
                Quitar
              </Button>
            </div>
            <Field label="Nombre de la dimensión">
              <Input
                value={d.name}
                maxLength={60}
                onChange={(e) => setDimension(i, { name: e.target.value })}
                placeholder="Ej. Confianza"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Polo positivo">
                <Input value={d.positiveLabel} maxLength={40} onChange={(e) => setDimension(i, { positiveLabel: e.target.value })} placeholder="Confiable" />
              </Field>
              <Field label="Polo negativo">
                <Input value={d.negativeLabel} maxLength={40} onChange={(e) => setDimension(i, { negativeLabel: e.target.value })} placeholder="Poco confiable" />
              </Field>
            </div>
          </div>
        ))}
      </div>

      {count < MAX_DIMENSIONS ? (
        <div className="space-y-2">
          <Button type="button" variant="secondary" onClick={() => addDimension()}>
            + Agregar dimensión
          </Button>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Ejemplos:</span>
            {EXAMPLE_DIMENSIONS.filter((ex) => !config.dimensions.some((d) => normalizeWord(d.positiveLabel) === normalizeWord(ex.positiveLabel))).map(
              (ex) => (
                <button
                  key={ex.name}
                  type="button"
                  onClick={() => addDimension(ex)}
                  className="rounded-full border border-border px-2.5 py-1 hover:border-primary hover:text-primary"
                >
                  {ex.positiveLabel} / {ex.negativeLabel}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}

      <Recommendation>
        Usa 2–3 dimensiones para no sobrecargar la sesión: cada dimensión añade ~{trials} ensayos con el protocolo
        {config.protocol === "classic7" ? " clásico" : " demo"}. Máximo {MAX_DIMENSIONS}.
      </Recommendation>
    </StepShell>
  );
}

// ---------------------------------------------------------------- 4. Palabras
function WordsStep({ config, update, version, bump }: StepProps & { version: number; bump: () => void }) {
  function setDimension(index: number, patch: Partial<IatDimension>) {
    update({ dimensions: config.dimensions.map((d, i) => (i === index ? { ...d, ...patch } : d)) });
  }
  return (
    <StepShell title="Paso 4 de 7" question="¿Qué palabras representan cada polo?">
      <p className="text-sm text-muted">
        Mínimo {MIN_WORDS_PER_POLE} palabras por polo (máximo {MAX_WORDS_PER_POLE}). Ninguna palabra debe repetirse dentro
        de una dimensión.
      </p>
      {config.dimensions.map((d, i) => {
        const suggestion = suggestWords(d.positiveLabel, d.negativeLabel);
        return (
          <div key={d.id} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">{d.name || `Dimensión ${i + 1}`}</h3>
              {suggestion ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 px-3"
                  onClick={() => {
                    setDimension(i, suggestion);
                    bump();
                  }}
                >
                  Cargar palabras sugeridas
                </Button>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">{d.positiveLabel} (polo positivo)</p>
                <WordsInput
                  ariaLabel={`Palabras de ${d.positiveLabel}`}
                  value={d.positiveWords}
                  onChange={(w) => setDimension(i, { positiveWords: w })}
                  min={MIN_WORDS_PER_POLE}
                  max={MAX_WORDS_PER_POLE}
                  resetKey={`${d.id}-p-${version}`}
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{d.negativeLabel} (polo negativo)</p>
                <WordsInput
                  ariaLabel={`Palabras de ${d.negativeLabel}`}
                  value={d.negativeWords}
                  onChange={(w) => setDimension(i, { negativeWords: w })}
                  min={MIN_WORDS_PER_POLE}
                  max={MAX_WORDS_PER_POLE}
                  resetKey={`${d.id}-n-${version}`}
                />
              </div>
            </div>
          </div>
        );
      })}
      <Recommendation>
        Elige adjetivos de intensidad emocional comparable dentro de cada polo, para que ninguna palabra domine al resto
        de su categoría.
      </Recommendation>
    </StepShell>
  );
}

// ---------------------------------------------------------------- 5. Protocolo
function ProtocolStep({ config, update }: StepProps) {
  const dims = Math.max(1, config.dimensions.length);
  const rows = (["classic7", "demo5"] as const).map((p) => ({
    p,
    perDim: trialsPerDimension(p),
    total: trialsPerDimension(p) * dims,
    minutes: estimateMinutes(p, dims),
  }));
  return (
    <StepShell title="Paso 5 de 7" question="¿Qué rigor necesita tu estudio?">
      <div className="space-y-3">
        <RadioCard
          name="protocol"
          checked={config.protocol === "classic7"}
          onChange={() => update({ protocol: "classic7" })}
          title="A · Estudio riguroso (protocolo clásico de 7 bloques)"
          badge="Recomendado"
        >
          {rows[0].perDim} ensayos por dimensión · {rows[0].total} en total · ~{rows[0].minutes} min. Para proyectos o
          tesis.
        </RadioCard>
        <RadioCard
          name="protocol"
          checked={config.protocol === "demo5"}
          onChange={() => update({ protocol: "demo5" })}
          title="B · Demo rápida (5 bloques)"
        >
          {rows[1].perDim} ensayos por dimensión · {rows[1].total} en total · ~{rows[1].minutes} min. Para clase o
          piloto; menor precisión.
        </RadioCard>
      </div>
      <Recommendation>
        Usa el protocolo clásico salvo que sea sólo una prueba piloto o demostración: es el estándar académico (Greenwald,
        Nosek &amp; Banaji, 2003) y hace tus resultados defendibles.
      </Recommendation>
    </StepShell>
  );
}

// ---------------------------------------------------------------- 6. Participante
const FIELD_TYPE_LABEL: Record<ExtraField["type"], string> = {
  text: "Texto libre",
  number: "Número",
  select: "Opción única",
  multiselect: "Opción múltiple",
  likert: "Escala Likert",
};

/** Convierte un campo a otro tipo conservando pregunta, id, obligatoriedad y opciones. */
function convertField(f: ExtraField, type: ExtraField["type"]): ExtraField {
  const base = { id: f.id, label: f.label, required: f.required };
  switch (type) {
    case "select":
    case "multiselect":
      return { ...base, type, options: "options" in f ? f.options : ["", ""] };
    case "likert": {
      const preset = LIKERT_PRESETS[0];
      return { ...base, type, points: LIKERT_DEFAULT_POINTS, minLabel: preset.minLabel, maxLabel: preset.maxLabel };
    }
    case "number":
      return { ...base, type };
    default:
      return { ...base, type: "text" };
  }
}

function ParticipantStep({ config, update }: StepProps) {
  const p = config.participant;
  const setParticipant = (patch: Partial<IatConfig["participant"]>) => update({ participant: { ...p, ...patch } });

  function setField(index: number, field: ExtraField) {
    setParticipant({ extraFields: p.extraFields.map((f, i) => (i === index ? field : f)) });
  }

  function addField(type: ExtraField["type"] = "text") {
    if (p.extraFields.length >= MAX_EXTRA_FIELDS) return;
    const id = uniqueId(`campo_${p.extraFields.length + 1}`, [...p.extraFields.map((f) => f.id), "age", "gender", "explicit"]);
    setParticipant({ extraFields: [...p.extraFields, convertField({ id, label: "", type: "text", required: false }, type)] });
  }

  return (
    <StepShell title="Paso 6 de 7" question="¿Qué datos pedirás a cada participante antes del test?">
      <div className="space-y-3 rounded-lg border border-border p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.collectAge} onChange={(e) => setParticipant({ collectAge: e.target.checked })} />
          Edad <span className="text-muted">(opcional para el participante)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.collectGender} onChange={(e) => setParticipant({ collectGender: e.target.checked })} />
          Género <span className="text-muted">({GENDER_OPTIONS.join(", ")}; opcional)</span>
        </label>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-4">
        <p className="text-sm font-medium">Preferencia explícita declarada (obligatoria)</p>
        <Input
          value={p.explicitQuestion}
          maxLength={200}
          onChange={(e) => setParticipant({ explicitQuestion: e.target.value })}
          aria-label="Pregunta de preferencia explícita"
        />
        <p className="text-xs text-muted">
          Opciones: «{config.conceptA.label || "Concepto A"}», «{config.conceptB.label || "Concepto B"}» y «{NEUTRAL_OPTION_LABEL}».
        </p>
      </div>

      <div className="space-y-3">
        {p.extraFields.map((f, i) => (
          <div key={f.id} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Pregunta adicional {i + 1}</span>
              <Button type="button" variant="ghost" className="h-8 px-2 text-red-600" onClick={() => setParticipant({ extraFields: p.extraFields.filter((_, j) => j !== i) })}>
                Quitar
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Pregunta" hint={f.type === "likert" ? "Escribe la afirmación que el participante valorará en la escala." : undefined}>
                <Input
                  value={f.label}
                  maxLength={80}
                  onChange={(e) => setField(i, { ...f, label: e.target.value })}
                  placeholder={f.type === "likert" ? "Ej. El café de especialidad vale lo que cuesta" : "Ej. ¿Con qué frecuencia consumes café?"}
                />
              </Field>
              <Field label="Tipo de respuesta">
                <select
                  value={f.type}
                  onChange={(e) => setField(i, convertField(f, e.target.value as ExtraField["type"]))}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                >
                  {(Object.keys(FIELD_TYPE_LABEL) as ExtraField["type"][]).map((t) => (
                    <option key={t} value={t}>
                      {FIELD_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {f.type === "select" || f.type === "multiselect" ? (
              <Field
                label="Opciones (una por línea)"
                hint={f.type === "multiselect" ? "El participante podrá marcar varias de estas opciones." : "El participante elegirá una sola opción."}
              >
                <Textarea
                  key={`${f.id}-${f.type}`}
                  defaultValue={f.options.join("\n")}
                  rows={4}
                  onChange={(e) => setField(i, { ...f, options: parseLines(e.target.value) })}
                />
              </Field>
            ) : null}
            {f.type === "likert" ? <LikertEditor field={f} onChange={(next) => setField(i, next)} /> : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { ...f, required: e.target.checked })} />
              Obligatoria
            </label>
          </div>
        ))}
        {p.extraFields.length < MAX_EXTRA_FIELDS ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => addField()}>
              + Agregar pregunta
            </Button>
            <Button type="button" variant="secondary" onClick={() => addField("likert")}>
              + Agregar escala Likert
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted">Llegaste al máximo de {MAX_EXTRA_FIELDS} preguntas adicionales.</p>
        )}
      </div>

      <Recommendation>
        Edad y género (opcionales) más la preferencia explícita (obligatoria): esta última permite el hallazgo central de
        disonancia entre lo implícito y lo declarado. Agrega variables relevantes a tu categoría (frecuencia de consumo,
        marca actual) con opción única o múltiple, o mide actitudes con escalas Likert (cada afirmación es una pregunta).
      </Recommendation>
    </StepShell>
  );
}

function LikertEditor({ field, onChange }: { field: Extract<ExtraField, { type: "likert" }>; onChange: (f: ExtraField) => void }) {
  const set = (patch: Partial<typeof field>) => onChange({ ...field, ...patch });
  return (
    <div className="space-y-3 rounded-md bg-foreground/[0.03] p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Puntos de la escala">
          <select
            value={field.points}
            onChange={(e) => set({ points: Number(e.target.value) })}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            {Array.from({ length: LIKERT_MAX_POINTS - LIKERT_MIN_POINTS + 1 }, (_, i) => LIKERT_MIN_POINTS + i).map((n) => (
              <option key={n} value={n}>
                {n} puntos
              </option>
            ))}
          </select>
        </Field>
        <Field label="Etiqueta del extremo bajo (1)">
          <Input value={field.minLabel ?? ""} maxLength={40} onChange={(e) => set({ minLabel: e.target.value || undefined })} />
        </Field>
        <Field label={`Etiqueta del extremo alto (${field.points})`}>
          <Input value={field.maxLabel ?? ""} maxLength={40} onChange={(e) => set({ maxLabel: e.target.value || undefined })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Etiquetas frecuentes:</span>
        {LIKERT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => set({ minLabel: preset.minLabel, maxLabel: preset.maxLabel })}
            className="rounded-full border border-border px-2.5 py-1 hover:border-primary hover:text-primary"
          >
            {preset.name}
          </button>
        ))}
      </div>
      <div className="space-y-1" aria-hidden>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: field.points }, (_, i) => (
            <span key={i} className="flex size-8 items-center justify-center rounded-md border border-border text-xs">
              {i + 1}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted">
          1 = {field.minLabel || "—"} · {field.points} = {field.maxLabel || "—"}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 7. Tema
function ThemeStep({ config, update }: StepProps) {
  return (
    <StepShell title="Paso 7 de 7" question="¿Qué identidad visual tendrá la plataforma del participante?">
      <div className="space-y-3">
        <RadioCard
          name="theme"
          checked={config.theme.mode === "neutral"}
          onChange={() => update({ theme: { mode: "neutral" } })}
          title="Paleta neutra"
          badge="Recomendado"
        >
          No sesga percepciones, especialmente en temas sensibles o con colores asociados a competidores.
        </RadioCard>
        <RadioCard
          name="theme"
          checked={config.theme.mode === "custom"}
          onChange={() => update({ theme: { mode: "custom", accent: config.theme.accent ?? "#4f46e5" } })}
          title="Color de acento de una marca"
        >
          {config.theme.mode === "custom" ? (
            <label className="mt-2 flex items-center gap-3 text-foreground">
              <input
                type="color"
                value={config.theme.accent ?? "#4f46e5"}
                onChange={(e) => update({ theme: { mode: "custom", accent: e.target.value } })}
                aria-label="Color de acento"
                className="h-9 w-14 cursor-pointer"
              />
              <span className="font-mono text-xs">{config.theme.accent}</span>
            </label>
          ) : (
            "Sólo afecta botones y acentos; los estímulos del test siempre van en alto contraste."
          )}
        </RadioCard>
      </div>
      <Recommendation>Usa la paleta neutra salvo que el estudio requiera una identidad de marca específica.</Recommendation>
    </StepShell>
  );
}

// ---------------------------------------------------------------- 8. Confirmación
function ConfirmStep({
  config,
  update,
  studyName,
  setStudyName,
  trials,
  minutes,
}: StepProps & { studyName: string; setStudyName: (v: string) => void; trials: number; minutes: number }) {
  const rows: [string, string][] = useMemo(
    () => [
      ["Producto / categoría", config.product],
      ["Conceptos", `${config.conceptA.label}  vs  ${config.conceptB.label}`],
      ["Dimensiones", config.dimensions.map((d) => `${d.name} (${d.positiveLabel} / ${d.negativeLabel})`).join(" · ")],
      ["Protocolo", config.protocol === "classic7" ? `Clásico de 7 bloques · ${trials} ensayos por dimensión` : `Demo de 5 bloques · ${trials} ensayos por dimensión`],
      ["Duración estimada", `~${minutes} min`],
      [
        "Datos del participante",
        [
          config.participant.collectAge && "Edad",
          config.participant.collectGender && "Género",
          "Preferencia explícita",
          ...config.participant.extraFields.map((f) => f.label),
        ]
          .filter(Boolean)
          .join(", "),
      ],
      ["Identidad visual", config.theme.mode === "neutral" ? "Paleta neutra" : `Acento ${config.theme.accent}`],
    ],
    [config, trials, minutes],
  );

  return (
    <StepShell title="Confirmación" question="Revisa el diseño de tu estudio">
      <dl className="divide-y divide-border rounded-lg border border-border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[180px_1fr]">
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-4">
        <h3 className="font-medium">Ajustes finales</h3>
        <Field label="Nombre del estudio">
          <Input value={studyName} maxLength={160} onChange={(e) => setStudyName(e.target.value)} />
        </Field>
        <Field label="Texto de consentimiento informado">
          <Textarea
            rows={8}
            value={config.texts.consent}
            maxLength={4000}
            onChange={(e) => update({ texts: { ...config.texts, consent: e.target.value } })}
          />
        </Field>
        <Field label="Mensaje de agradecimiento (al terminar)">
          <Textarea
            rows={3}
            value={config.texts.thankYou}
            maxLength={1000}
            placeholder={DEFAULT_THANK_YOU}
            onChange={(e) => update({ texts: { ...config.texts, thankYou: e.target.value } })}
          />
        </Field>
        <div className="space-y-2">
          <p className="text-sm font-medium">Si el participante entra desde celular o tableta</p>
          <RadioCard
            name="deviceNotice"
            checked={config.deviceNotice === "inform"}
            onChange={() => update({ deviceNotice: "inform" })}
            title="Aviso informativo"
            badge="Predeterminado"
          >
            Se le recomienda usar computadora con teclado para mayor fiabilidad, pero puede continuar en su dispositivo.
          </RadioCard>
          <RadioCard
            name="deviceNotice"
            checked={config.deviceNotice === "suggest_desktop"}
            onChange={() => update({ deviceNotice: "suggest_desktop" })}
            title="Sugerir con insistencia cambiar a computadora"
          >
            El aviso destaca la opción de continuar luego en computadora; igualmente podrá continuar.
          </RadioCard>
        </div>
      </div>

      <Alert tone="info">
        Si el tema es sensible (política, salud, etc.), documenta el consentimiento informado y el uso ético de los datos
        de tus participantes.
      </Alert>
    </StepShell>
  );
}
