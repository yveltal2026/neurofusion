"use client";

import { useId } from "react";
import { Icon, type IconName } from "@/components/brand/icon";
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

function TemplateRow({
  t,
  onPick,
}: {
  t: SurveyTemplate;
  onPick: (t: SurveyTemplate) => void;
}) {
  const descId = useId();
  return (
    <li className="group relative flex items-center gap-4 px-2 py-4 transition-colors duration-150 hover:bg-neuro-wash motion-reduce:transition-none sm:px-3">
      <IconTile name={TEMPLATE_ICONS[t.id] ?? "survey"} size="md" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <h2 className="font-display text-base font-semibold leading-snug text-heading">
          <button
            type="button"
            aria-describedby={descId}
            onClick={() => onPick(t)}
            className="text-left after:absolute after:inset-0"
          >
            {t.name}
          </button>
        </h2>
        <p id={descId} className="text-sm text-muted">
          {t.description}
        </p>
      </div>
      <p className="hidden shrink-0 text-sm text-muted sm:block">{statsLabel(t.id)}</p>
      <Icon name="arrow" className="size-5 shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-neuro-ink motion-reduce:transition-none" />
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
      <ul className="divide-y divide-border border-y border-border">
        <TemplateRow t={blank!} onPick={onPick} />
        {ready.map((t) => (
          <TemplateRow key={t.id} t={t} onPick={onPick} />
        ))}
      </ul>
    </div>
  );
}
