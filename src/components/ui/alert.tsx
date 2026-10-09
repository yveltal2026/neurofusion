import type { ReactNode } from "react";

const tones = {
  error: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  info: "border-primary/30 bg-primary/10",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
} as const;

export function Alert({
  tone = "info",
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
