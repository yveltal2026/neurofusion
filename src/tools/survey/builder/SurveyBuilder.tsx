"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  getInstrument,
  INSTRUMENT_IDS,
  renderItemText,
  type InstrumentId,
} from "../engine";
import { createSurveyStudy } from "./actions";
import {
  addInstrumentBlock,
  addPriceBlock,
  parsePrices,
  addQuestion,
  addQuestionsBlock,
  buildConfig,
  emptyDraft,
  moveBlock,
  moveQuestion,
  QUESTION_TYPE_LABELS,
  removeBlock,
  removeQuestion,
  setConsent,
  setTitle,
  TEMPLATES,
  updateBlock,
  updateQuestion,
  type DraftBlock,
  type DraftQuestion,
  type QuestionType,
  type SurveyDraft,
} from "./model";

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";

type QuestionsBlock = Extract<DraftBlock, { kind: "questions" }>;
type InstrumentBlock = Extract<DraftBlock, { kind: "instrument" }>;
type PriceBlock = Extract<DraftBlock, { kind: "price" }>;

function IconButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-9 px-3"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {label.startsWith("Subir") ? "↑" : label.startsWith("Bajar") ? "↓" : "✕"}
    </Button>
  );
}

function QuestionEditor({
  q,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  q: DraftQuestion;
  index: number;
  count: number;
  onChange: (patch: Partial<DraftQuestion>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
        Pregunta {index + 1} · {QUESTION_TYPE_LABELS[q.type]}
      </legend>
      <Field label="Enunciado">
        <Input
          value={q.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          maxLength={300}
        />
      </Field>

      {q.type === "select" || q.type === "multiselect" ? (
        <Field label="Opciones" hint="Una opción por línea.">
          <Textarea
            value={q.optionsText}
            onChange={(e) => onChange({ optionsText: e.target.value })}
            rows={4}
          />
        </Field>
      ) : null}

      {q.type === "likert" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Puntos de la escala">
            <Input
              type="number"
              min={3}
              max={10}
              value={q.points}
              onChange={(e) => onChange({ points: Number(e.target.value) })}
            />
          </Field>
          <Field label="Etiqueta del extremo bajo">
            <Input
              value={q.minLabel}
              onChange={(e) => onChange({ minLabel: e.target.value })}
              maxLength={40}
            />
          </Field>
          <Field label="Etiqueta del extremo alto">
            <Input
              value={q.maxLabel}
              onChange={(e) => onChange({ maxLabel: e.target.value })}
              maxLength={40}
            />
          </Field>
        </div>
      ) : null}

      {q.type === "number" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mínimo (opcional)">
            <Input
              type="number"
              value={q.min}
              onChange={(e) => onChange({ min: e.target.value })}
            />
          </Field>
          <Field label="Máximo (opcional)">
            <Input
              type="number"
              value={q.max}
              onChange={(e) => onChange({ max: e.target.value })}
            />
          </Field>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={q.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Obligatoria
        </label>
        <div className="flex gap-1">
          <IconButton
            label={`Subir pregunta ${index + 1}`}
            onClick={() => onMove(-1)}
            disabled={index === 0}
          />
          <IconButton
            label={`Bajar pregunta ${index + 1}`}
            onClick={() => onMove(1)}
            disabled={index === count - 1}
          />
          <IconButton
            label={`Quitar pregunta ${index + 1}`}
            onClick={onRemove}
          />
        </div>
      </div>
    </fieldset>
  );
}

function BlockShell({
  title,
  index,
  count,
  onMove,
  onRemove,
  children,
}: {
  title: string;
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">
          Bloque {index + 1} · {title}
        </h3>
        <div className="flex gap-1">
          <IconButton
            label={`Subir bloque ${index + 1}`}
            onClick={() => onMove(-1)}
            disabled={index === 0}
          />
          <IconButton
            label={`Bajar bloque ${index + 1}`}
            onClick={() => onMove(1)}
            disabled={index === count - 1}
          />
          <IconButton label={`Quitar bloque ${index + 1}`} onClick={onRemove} />
        </div>
      </div>
      {children}
    </Card>
  );
}

function PriceEditor({ block, onChange }: { block: PriceBlock; onChange: (patch: Partial<PriceBlock>) => void }) {
  const gg = block.method === "gabor_granger";
  const prices = parsePrices(block.pricesText);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sobre qué se pregunta" hint="Frase completa. Ejemplo: «esta suscripción mensual». Por defecto: «este producto».">
          <Input value={block.subject} onChange={(e) => onChange({ subject: e.target.value })} placeholder="este producto" maxLength={80} />
        </Field>
        <Field label="Moneda" hint="Se muestra junto a los precios.">
          <Input value={block.currency} onChange={(e) => onChange({ currency: e.target.value })} placeholder="MXN" maxLength={8} />
        </Field>
      </div>
      {gg ? (
        <Field label="Precios a probar" hint="Entre 3 y 10, separados por comas (decimales con punto). Se muestran de menor a mayor.">
          <Input value={block.pricesText} onChange={(e) => onChange({ pricesText: e.target.value })} placeholder="100, 150, 200, 250, 300" />
        </Field>
      ) : null}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={block.required} onChange={(e) => onChange({ required: e.target.checked })} />
        Obligatorio
      </label>
      <p className="text-xs text-muted">
        {gg
          ? `El participante responde sí o no a cada uno de los ${prices.filter((p) => Number.isFinite(p)).length} precios. `
          : "El participante escribe cuatro precios: muy barato, ganga, caro y demasiado caro. "}
        Es intención declarada: sobreestima la compra real y no es un pronóstico de ventas. Se recomiendan 100 respuestas o más.
      </p>
    </div>
  );
}

function InstrumentEditor({
  block,
  onChange,
}: {
  block: InstrumentBlock;
  onChange: (patch: Partial<InstrumentBlock>) => void;
}) {
  const def = getInstrument(block.instrumentId);
  const subject = block.subject.trim() || def.defaultSubject;
  return (
    <div className="space-y-3">
      <Field
        label="Sobre qué se pregunta"
        hint={`Frase completa que sustituye al sujeto de los ítems (por defecto: «${def.defaultSubject}»). Ejemplo: «esta tienda en línea».`}
      >
        <Input
          value={block.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
          placeholder={def.defaultSubject}
          maxLength={80}
        />
      </Field>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={block.required}
          onChange={(e) => onChange({ required: e.target.checked })}
        />
        Obligatorio
      </label>
      <details className="text-sm">
        <summary className="cursor-pointer py-1 text-muted">
          Ver los{" "}
          {def.items.length === 1 ? "texto" : `${def.items.length} textos`} que
          verá el participante
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {def.items.map((item) => (
            <li key={item.n}>{renderItemText(item, subject)}</li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted">
          {def.source} {def.notes}
        </p>
      </details>
    </div>
  );
}

export function SurveyBuilder({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [draft, setDraft] = useState<SurveyDraft>(emptyDraft());
  const [chosenTemplate, setChosenTemplate] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [newType, setNewType] = useState<QuestionType>("select");

  const patch = (fn: (d: SurveyDraft) => SurveyDraft) => setDraft(fn);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!draft.name.trim()) {
      setErrors(["Escribe un nombre para el estudio"]);
      return;
    }
    const built = buildConfig(draft);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors([]);
    startTransition(async () => {
      const res = await createSurveyStudy({
        projectId,
        name: draft.name,
        config: built.config,
      });
      // En éxito la acción redirige; sólo vuelve aquí si hubo un error.
      if (res?.error) setServerError(res.error);
    });
  }

  if (!chosenTemplate) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Proyecto: {projectName}. Elige un punto de partida; todo es editable
          después.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="block h-full w-full text-left"
                onClick={() => {
                  setDraft(t.build());
                  setChosenTemplate(true);
                }}
              >
                <Card className="h-full transition hover:border-primary">
                  <h2 className="font-medium">{t.name}</h2>
                  <p className="mt-1 text-sm text-muted">{t.description}</p>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <Card className="space-y-4">
        <h2 className="font-medium">Datos básicos</h2>
        <Field label="Nombre del estudio" hint="Sólo lo ves tú.">
          <Input
            value={draft.name}
            onChange={(e) => patch((d) => ({ ...d, name: e.target.value }))}
            maxLength={160}
          />
        </Field>
        <Field label="Título para el participante">
          <Input
            value={draft.title}
            onChange={(e) => patch((d) => setTitle(d, e.target.value))}
            maxLength={160}
          />
        </Field>
        <Field
          label="Introducción (opcional)"
          hint="Se muestra antes del consentimiento."
        >
          <Textarea
            value={draft.intro}
            onChange={(e) => patch((d) => ({ ...d, intro: e.target.value }))}
            rows={3}
            maxLength={2000}
          />
        </Field>
      </Card>

      <section className="space-y-4" aria-label="Bloques">
        <h2 className="text-lg font-semibold">Bloques</h2>
        <p className="text-sm text-muted">
          El participante ve un bloque por pantalla, en este orden.
        </p>

        {draft.blocks.map((block, index) =>
          block.kind === "price" ? (
            <BlockShell
              key={block.id}
              title={block.method === "van_westendorp" ? "Precio · Van Westendorp" : "Precio · Gabor-Granger"}
              index={index}
              count={draft.blocks.length}
              onMove={(delta) => patch((d) => moveBlock(d, block.id, delta))}
              onRemove={() => patch((d) => removeBlock(d, block.id))}
            >
              <PriceEditor block={block} onChange={(p) => patch((d) => updateBlock(d, block.id, p))} />
            </BlockShell>
          ) : block.kind === "instrument" ? (
            <BlockShell
              key={block.id}
              title={getInstrument(block.instrumentId).name}
              index={index}
              count={draft.blocks.length}
              onMove={(delta) => patch((d) => moveBlock(d, block.id, delta))}
              onRemove={() => patch((d) => removeBlock(d, block.id))}
            >
              <InstrumentEditor
                block={block}
                onChange={(p) => patch((d) => updateBlock(d, block.id, p))}
              />
            </BlockShell>
          ) : (
            <BlockShell
              key={block.id}
              title="Preguntas"
              index={index}
              count={draft.blocks.length}
              onMove={(delta) => patch((d) => moveBlock(d, block.id, delta))}
              onRemove={() => patch((d) => removeBlock(d, block.id))}
            >
              <QuestionsEditor
                block={block}
                newType={newType}
                setNewType={setNewType}
                onAdd={() => patch((d) => addQuestion(d, block.id, newType))}
                onChange={(qid, p) =>
                  patch((d) => updateQuestion(d, block.id, qid, p))
                }
                onMove={(qid, delta) =>
                  patch((d) => moveQuestion(d, block.id, qid, delta))
                }
                onRemove={(qid) =>
                  patch((d) => removeQuestion(d, block.id, qid))
                }
              />
            </BlockShell>
          ),
        )}

        <Card className="space-y-3">
          <h3 className="font-medium">Agregar bloque</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => patch(addQuestionsBlock)}
            >
              Preguntas propias
            </Button>
            {INSTRUMENT_IDS.map((id: InstrumentId) => (
              <Button
                key={id}
                type="button"
                variant="secondary"
                onClick={() => patch((d) => addInstrumentBlock(d, id))}
              >
                {getInstrument(id).name}
              </Button>
            ))}
            <Button type="button" variant="secondary" onClick={() => patch((d) => addPriceBlock(d, "van_westendorp"))}>
              Precio: Van Westendorp
            </Button>
            <Button type="button" variant="secondary" onClick={() => patch((d) => addPriceBlock(d, "gabor_granger"))}>
              Precio: Gabor-Granger
            </Button>
          </div>
        </Card>
      </section>

      <Card className="space-y-4">
        <h2 className="font-medium">Textos para el participante</h2>
        <Field
          label="Consentimiento"
          hint="Se genera con el título; edítalo si lo necesitas. Tu equipo legal debe validarlo antes de usar la liga con personas reales."
        >
          <Textarea
            value={draft.consent}
            onChange={(e) => patch((d) => setConsent(d, e.target.value))}
            rows={7}
            maxLength={4000}
          />
        </Field>
        <Field label="Mensaje de agradecimiento">
          <Textarea
            value={draft.thankYou}
            onChange={(e) => patch((d) => ({ ...d, thankYou: e.target.value }))}
            rows={3}
            maxLength={1000}
          />
        </Field>
      </Card>

      {errors.length ? (
        <Alert tone="error">
          <p className="font-medium">Revisa lo siguiente:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.slice(0, 8).map((er) => (
              <li key={er}>{er}</li>
            ))}
          </ul>
          {errors.length > 8 ? (
            <p className="mt-1">…y {errors.length - 8} más.</p>
          ) : null}
        </Alert>
      ) : null}
      {serverError ? <Alert tone="error">{serverError}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear encuesta y generar liga"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (
              window.confirm("¿Empezar de nuevo? Se perderá lo que llevas.")
            ) {
              setDraft(emptyDraft());
              setErrors([]);
              setChosenTemplate(false);
            }
          }}
        >
          Cambiar plantilla
        </Button>
      </div>
    </form>
  );
}

function QuestionsEditor({
  block,
  newType,
  setNewType,
  onAdd,
  onChange,
  onMove,
  onRemove,
}: {
  block: QuestionsBlock;
  newType: QuestionType;
  setNewType: (t: QuestionType) => void;
  onAdd: () => void;
  onChange: (questionId: string, patch: Partial<DraftQuestion>) => void;
  onMove: (questionId: string, delta: -1 | 1) => void;
  onRemove: (questionId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {block.questions.length === 0 ? (
        <p className="text-sm text-muted">
          Este bloque aún no tiene preguntas.
        </p>
      ) : null}
      {block.questions.map((q, i) => (
        <QuestionEditor
          key={q.id}
          q={q}
          index={i}
          count={block.questions.length}
          onChange={(p) => onChange(q.id, p)}
          onMove={(delta) => onMove(q.id, delta)}
          onRemove={() => onRemove(q.id)}
        />
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1.5 text-sm">
          <span className="block font-medium text-heading">
            Tipo de pregunta
          </span>
          <select
            className={SELECT_CLASS}
            value={newType}
            onChange={(e) => setNewType(e.target.value as QuestionType)}
          >
            {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="secondary" onClick={onAdd}>
          Agregar pregunta
        </Button>
      </div>
    </div>
  );
}
