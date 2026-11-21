const LABEL = {
  measured: "Medido",
  estimated: "Estimado",
  modeled: "Modelado",
} as const;

const DESCRIPTION = {
  measured: "Datos reales recolectados de participantes",
  estimated: "Predicción generada con inteligencia artificial",
  modeled: "Evaluación técnica basada en reglas sobre URL o HTML",
} as const;

export type EvidenceKind = keyof typeof LABEL;

export function EvidenceBadge({ kind }: { kind: EvidenceKind }) {
  return (
    <span
      title={DESCRIPTION[kind]}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-heading"
    >
      <span
        aria-hidden="true"
        className={`size-3 bg-current [mask-size:contain] ${kind === "estimated" ? "text-accent-ink" : ""}`}
        style={{
          maskImage: `url(/brand/aesteros/aesteros-sello-${LABEL[kind].toLowerCase()}.svg)`,
        }}
      />
      <span>{LABEL[kind]}</span>
      <span className="sr-only"> — {DESCRIPTION[kind]}</span>
    </span>
  );
}
