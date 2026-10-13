import type { ReactNode } from "react";

/**
 * Etiqueta de estado. Como el Alert de la marca: el texto va en tinta y el color sólo
 * acompaña (punto + tinte), así se lee igual en claro, oscuro e impresión. «strong» es
 * la versión sólida para el nivel más grave.
 */
const tones = {
  strong: "border-danger bg-danger text-danger-foreground",
  danger: "border-danger/40 bg-danger/10 text-foreground",
  warning: "border-warning/45 bg-warning/12 text-foreground",
  success: "border-success/40 bg-success/10 text-foreground",
  neutral: "border-border bg-foreground/5 text-foreground",
} as const;

const dots = { strong: "bg-danger-foreground", danger: "bg-danger", warning: "bg-warning", success: "bg-success", neutral: "bg-muted" } as const;

export type StatusTone = keyof typeof tones;

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dots[tone]}`} />
      {children}
    </span>
  );
}
