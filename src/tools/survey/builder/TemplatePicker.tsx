"use client";

import { useId } from "react";
import type { IconName } from "@/components/brand/icon";
import { IconTile } from "@/components/ui/icon-tile";
import { countItems, TEMPLATES, type SurveyTemplate } from "./model";

const TEMPLATE_ICONS: Record<string, IconName> = {
  blank: "plus",
  usability: "device",
  brand: "target",
  emotion: "neuro",
};

// Se calcula una vez: las plantillas son estáticas.
const STATS = new Map(TEMPLATES.map((t) => [t.id, countItems(t.build())]));

function statsLabel(id: string): string {
  const s = STATS.get(id);
  if (!s || s.blocks === 0) return "Sin bloques";
  return `${s.blocks} ${s.blocks === 1 ? "bloque" : "bloques"} · ${s.items} ${s.items === 1 ? "pregunta" : "preguntas"}`;
}

function TemplateCard({
  t,
  onPick,
}: {
  t: SurveyTemplate;
  onPick: (t: SurveyTemplate) => void;
}) {
  const descId = useId();
  const blank = t.id === "blank";
  return (
    <li
      className={`relative flex gap-4 rounded-lg p-5 transition-colors duration-150 motion-reduce:transition-none ${
        blank
          ? "border-2 border-dashed border-border hover:border-heading"
          : "border border-border bg-surface hover:border-heading"
      }`}
    >
      <IconTile name={TEMPLATE_ICONS[t.id] ?? "survey"} size="lg" />
      <div className="min-w-0 space-y-1">
        <h2 className="text-base font-semibold leading-snug">
          <button
            type="button"
            aria-describedby={descId}
            onClick={() => onPick(t)}
            className="text-left after:absolute after:inset-0 after:rounded-lg"
          >
            {t.name}
          </button>
        </h2>
        <p id={descId} className="text-sm text-muted">
          {t.description}
        </p>
        <p className="pt-1 text-xs font-medium text-heading">
          {statsLabel(t.id)}
        </p>
      </div>
    </li>
  );
}

/** Primer paso: elegir un punto de partida, como la galería de plantillas de un editor de formularios. */
export function TemplatePicker({
  projectName,
  onPick,
}: {
  projectName: string;
  onPick: (t: SurveyTemplate) => void;
}) {
  const [blank, ...ready] = TEMPLATES;
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm text-muted">Proyecto: {projectName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nueva encuesta
        </h1>
        <p className="text-sm text-muted">
          Elige un punto de partida; todo se puede editar después.
        </p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        <TemplateCard t={blank!} onPick={onPick} />
        {ready.map((t) => (
          <TemplateCard key={t.id} t={t} onPick={onPick} />
        ))}
      </ul>
    </div>
  );
}
