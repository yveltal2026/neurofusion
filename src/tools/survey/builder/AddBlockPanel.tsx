"use client";

import { useId, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/brand/icon";
import { IconTile } from "@/components/ui/icon-tile";
import { Button } from "@/components/ui/button";
import { INSTRUMENT_IDS, type InstrumentId, type PriceMethod } from "../engine";
import {
  INSTRUMENT_CATALOG,
  PRICE_CATALOG,
  QUESTION_TYPE_ICONS,
} from "./catalog";
import { QUESTION_TYPE_LABELS, type QuestionType } from "./model";

const TYPES = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];

/** Fila de menú: icono, nombre y una frase. El nombre accesible es sólo el título. */
function RowButton({
  icon,
  title,
  blurb,
  onClick,
}: {
  icon: IconName;
  title: string;
  blurb: string;
  onClick: () => void;
}) {
  const titleId = useId();
  const blurbId = useId();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-labelledby={titleId}
      aria-describedby={blurbId}
      className="flex w-full items-start gap-3 rounded-md border border-border bg-background p-3 text-left transition-colors duration-150 hover:border-heading hover:bg-heading/5 motion-reduce:transition-none"
    >
      <IconTile name={icon} size="sm" />
      <span className="min-w-0">
        <span id={titleId} className="block text-sm font-semibold text-heading">
          {title}
        </span>
        <span id={blurbId} className="block text-xs text-muted">
          {blurb}
        </span>
      </span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted">{title}</h4>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/**
 * Menú inline para agregar un bloque. Con la encuesta vacía se muestra abierto y enseña el
 * primer paso; con bloques, queda en un botón que lo despliega.
 */
export function AddBlockPanel({
  empty,
  open,
  onOpen,
  onClose,
  onAddQuestions,
  onAddInstrument,
  onAddPrice,
}: {
  empty: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAddQuestions: () => void;
  onAddInstrument: (id: InstrumentId) => void;
  onAddPrice: (method: PriceMethod) => void;
}) {
  if (!open && !empty) {
    return (
      <div id="sb-add" className="scroll-mt-28">
        <Button
          type="button"
          variant="secondary"
          className="w-full border-dashed"
          onClick={onOpen}
        >
          <Icon name="plus" className="size-5" />
          Agregar bloque
        </Button>
      </div>
    );
  }
  return (
    <section
      id="sb-add"
      aria-label="Agregar bloque"
      className="scroll-mt-28 space-y-5 rounded-lg border-2 border-dashed border-border p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">
            {empty ? "¿Qué quieres preguntar primero?" : "Agregar bloque"}
          </h3>
          <p className="text-sm text-muted">
            El participante ve un bloque por pantalla, en el orden en que los
            pongas.
          </p>
        </div>
        {!empty ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        ) : null}
      </div>

      <Group title="Tus preguntas">
        <RowButton
          icon="survey"
          title="Preguntas propias"
          blurb="Opción única o múltiple, escala, número y texto libre."
          onClick={onAddQuestions}
        />
      </Group>

      <Group title="Instrumentos estandarizados (el servidor los puntúa)">
        {INSTRUMENT_IDS.map((id) => (
          <RowButton
            key={id}
            icon={INSTRUMENT_CATALOG[id].icon}
            title={INSTRUMENT_CATALOG[id].short}
            blurb={INSTRUMENT_CATALOG[id].blurb}
            onClick={() => onAddInstrument(id)}
          />
        ))}
      </Group>

      <Group title="Sensibilidad al precio">
        {(Object.keys(PRICE_CATALOG) as PriceMethod[]).map((m) => (
          <RowButton
            key={m}
            icon={PRICE_CATALOG[m].icon}
            title={`Precio: ${PRICE_CATALOG[m].short}`}
            blurb={PRICE_CATALOG[m].blurb}
            onClick={() => onAddPrice(m)}
          />
        ))}
      </Group>
    </section>
  );
}

/** Botones de un clic para agregar una pregunta de cada tipo al final de un bloque. */
export function AddQuestionRow({
  onAdd,
  first,
}: {
  onAdd: (type: QuestionType) => void;
  first: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Agregar pregunta"
      className="space-y-2 rounded-lg border border-dashed border-border px-5 py-4"
    >
      <p className="text-sm font-medium text-heading">
        {first ? "Elige el tipo de la primera pregunta" : "Agregar pregunta"}
      </p>
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onAdd(t)}
            className="inline-flex h-10 items-center gap-2 rounded-full border-2 border-heading/30 px-4 text-sm font-semibold text-heading transition-colors duration-150 hover:border-heading hover:bg-heading/10 motion-reduce:transition-none"
          >
            <Icon name={QUESTION_TYPE_ICONS[t]} className="size-5" />
            {QUESTION_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
