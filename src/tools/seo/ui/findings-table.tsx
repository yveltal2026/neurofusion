"use client";

import { useMemo, useState } from "react";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { CATEGORY_LABEL, ruleDef, SEVERITY_LABEL, type Finding, type Severity } from "../engine";

const SEVERITY_TONE: Record<Severity, StatusTone> = { critical: "strong", high: "danger", medium: "warning", ok: "success" };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <StatusBadge tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</StatusBadge>;
}

/** Tabla de hallazgos con filtro por severidad (por defecto oculta los correctos). */
export function FindingsTable({ findings }: { findings: Finding[] }) {
  const [show, setShow] = useState<Record<Severity, boolean>>({ critical: true, high: true, medium: true, ok: false });
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      findings.filter(
        (f) =>
          show[f.severity] &&
          (!query || `${f.element} ${f.detail} ${f.url ?? ""}`.toLowerCase().includes(query.toLowerCase())),
      ),
    [findings, show, query],
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm print:hidden">
        {(Object.keys(show) as Severity[]).map((s) => (
          <label key={s} className="flex items-center gap-1.5">
            <input type="checkbox" checked={show[s]} onChange={(e) => setShow({ ...show, [s]: e.target.checked })} />
            {SEVERITY_LABEL[s]} ({findings.filter((f) => f.severity === s).length})
          </label>
        ))}
        <input
          type="search"
          placeholder="Filtrar por texto o URL"
          aria-label="Filtrar hallazgos por texto o URL"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto rounded-md border border-control bg-background px-3 py-1.5 text-sm"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-neuro-wash font-display text-xs font-semibold text-muted">
            <tr>
              <th className="px-3 py-2">Severidad</th>
              <th className="px-3 py-2">Elemento</th>
              <th className="px-3 py-2">Detalle</th>
              <th className="px-3 py-2">Página</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((f, i) => (
              <tr key={`${f.rule}-${f.url}-${i}`} className="align-top">
                <td className="px-3 py-2">
                  <SeverityBadge severity={f.severity} />
                </td>
                <td className="px-3 py-2">
                  <p className="font-medium">{f.element}</p>
                  <p className="text-xs text-muted">{CATEGORY_LABEL[f.category]}</p>
                </td>
                <td className="px-3 py-2">
                  <p>{f.detail}</p>
                  {f.severity !== "ok" && ruleDef(f.rule) ? <p className="mt-1 text-xs text-muted">→ {ruleDef(f.rule)?.advice}</p> : null}
                </td>
                <td className="max-w-56 break-all px-3 py-2 text-xs text-muted">{f.url ?? "Todo el sitio"}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted">
                  Sin hallazgos con estos filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
