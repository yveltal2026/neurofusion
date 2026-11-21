import Link from "next/link";
import type { PlanTier } from "@/lib/db/types";

export function PlanCreditBadge({
  planBadge,
  planTier,
  credits,
}: {
  planBadge: string;
  planTier: PlanTier;
  credits: number;
}) {
  const lowCredits = credits <= 5;
  return (
    <Link
      href="/membresia"
      title="Ver plan, límites y créditos"
      className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
        lowCredits
          ? "border-amber-500/50 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300"
          : "border-control bg-surface-muted/70 text-heading hover:bg-surface-muted"
      }`}
    >
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide ${
          planTier === "demo"
            ? "bg-amber-500/20 text-amber-900 dark:text-amber-200"
            : "bg-heading text-background"
        }`}
      >
        {planBadge}
      </span>
      <span className="tabular-nums">
        {credits} {credits === 1 ? "crédito" : "créditos"}
      </span>
    </Link>
  );
}
