const LABEL = {
  measured: "Medido",
  estimated: "Estimado",
  modeled: "Modelado",
} as const;
export type EvidenceKind = keyof typeof LABEL;

export function EvidenceBadge({ kind }: { kind: EvidenceKind }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-heading">
      <span
        aria-hidden="true"
        className={`size-3 bg-current [mask-size:contain] ${kind === "estimated" ? "text-accent-ink" : ""}`}
        style={{
          maskImage: `url(/brand/aesteros/aesteros-sello-${LABEL[kind].toLowerCase()}.svg)`,
        }}
      />
      {LABEL[kind]}
    </span>
  );
}
