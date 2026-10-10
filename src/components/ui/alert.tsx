import type { ReactNode } from "react";

// El color no es el único aviso (manual, cap. 20): el texto siempre va en tinta y la burbuja sólo acompaña.
const tones = {
  error: { box: "border-danger/40 bg-danger/10", dot: "bg-danger" },
  info: { box: "border-primary/50 bg-primary/10", dot: "bg-primary" },
  warning: { box: "border-warning/40 bg-warning/10", dot: "bg-warning" },
} as const;

export function Alert({
  tone = "info",
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  const t = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-3 rounded-md border px-4 py-3 text-sm ${t.box}`}>
      <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${t.dot}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
