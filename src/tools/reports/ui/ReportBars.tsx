export function ReportBars({
  rows,
  max = 100,
}: {
  rows: { label: string; value: number | null; detail: string }[];
  max?: number;
}) {
  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row.label} className="space-y-1 text-sm">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 break-words">{row.label}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {row.detail}
            </span>
          </div>
          <div
            aria-hidden="true"
            className="h-2 overflow-hidden rounded-full bg-foreground/10"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${Math.max(0, Math.min(1, (row.value ?? 0) / max)) * 100}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
