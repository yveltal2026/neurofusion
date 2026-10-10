import Link from "next/link";
import { StudyTabs } from "@/components/study-tabs";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { loadStudyForResearcher } from "@/lib/studies";
import { loadSessionViews } from "@/tools/iat/results/load";
import { DEVICE_LABEL, STATUS_LABEL, validityText } from "@/tools/iat/results/labels";
import { filterViews, type ViewFilters } from "@/tools/iat/results/views";

const PAGE_SIZE = 25;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );
}

export default async function DataPage({ params, searchParams }: PageProps<"/studies/[id]/data">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { study, config } = await loadStudyForResearcher(supabase, id);
  const all = await loadSessionViews(supabase, id, config);

  const filters: ViewFilters = {
    status: pick(one(sp.status), ["all", "completed", "started", "abandoned"] as const, "all"),
    validity: pick(one(sp.validity), ["all", "valid", "invalid"] as const, "all"),
    device: pick(one(sp.device), ["all", "desktop", "mobile", "tablet"] as const, "all"),
    duplicates: pick(one(sp.dup), ["all", "only"] as const, "all"),
    excluded: pick(one(sp.excluded), ["all", "hide", "only"] as const, "all"),
  };
  const filtered = filterViews(all, filters);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(one(sp.page)) || 1));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const completed = all.filter((s) => s.status === "completed");
  const stats = {
    completed: completed.length,
    started: all.filter((s) => s.status === "started").length,
    abandoned: all.filter((s) => s.status === "abandoned").length,
    invalid: completed.filter((s) => s.allValid === false).length,
    dup: all.filter((s) => s.duplicate_flag).length,
    excluded: all.filter((s) => s.excluded).length,
    mobile: completed.filter((s) => s.device_type === "mobile" || s.device_type === "tablet").length,
  };

  const query = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status: filters.status, validity: filters.validity, device: filters.device, dup: filters.duplicates, excluded: filters.excluded, ...extra })) {
      if (v && v !== "all") p.set(k, v);
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  const selectClass = "h-9 rounded-md border border-border bg-background px-2 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${study.project_id}`} className="text-sm text-muted hover:underline">
          ← Proyecto
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{study.name}</h1>
      </div>
      <StudyTabs id={id} active="data" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Completadas" value={stats.completed} />
        <Stat label="En curso" value={stats.started} />
        <Stat label="Abandonadas" value={stats.abandoned} />
        <Stat label="Datos a revisar" value={stats.invalid} />
        <Stat label="Posibles duplicados" value={stats.dup} />
        <Stat label="Excluidas del análisis" value={stats.excluded} />
        <Stat label="Desde celular/tableta" value={stats.mobile} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs text-muted">
            Estado
            <select name="status" defaultValue={filters.status} className={`${selectClass} block`}>
              <option value="all">Todos</option>
              <option value="completed">Completadas</option>
              <option value="started">En curso</option>
              <option value="abandoned">Abandonadas</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            Calidad
            <select name="validity" defaultValue={filters.validity} className={`${selectClass} block`}>
              <option value="all">Todas</option>
              <option value="valid">Válidas</option>
              <option value="invalid">A revisar</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            Dispositivo
            <select name="device" defaultValue={filters.device} className={`${selectClass} block`}>
              <option value="all">Todos</option>
              <option value="desktop">Escritorio</option>
              <option value="mobile">Celular</option>
              <option value="tablet">Tableta</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            Duplicados
            <select name="dup" defaultValue={filters.duplicates} className={`${selectClass} block`}>
              <option value="all">Todas</option>
              <option value="only">Sólo posibles duplicados</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            Exclusión
            <select name="excluded" defaultValue={filters.excluded} className={`${selectClass} block`}>
              <option value="all">Todas</option>
              <option value="hide">Ocultar excluidas</option>
              <option value="only">Sólo excluidas</option>
            </select>
          </label>
          <button type="submit" className={buttonClass("secondary", "h-9")}>
            Filtrar
          </button>
        </form>
        <div className="flex gap-2">
          <a href={`/api/studies/${id}/export/session_summary`} className={buttonClass("secondary", "h-9")}>
            session_summary.csv
          </a>
          <a href={`/api/studies/${id}/export/raw_trials`} className={buttonClass("secondary", "h-9")}>
            raw_trials.csv
          </a>
        </div>
      </div>

      {all.length === 0 ? (
        <Card className="text-sm text-muted">Aún no hay respuestas. Comparte la liga del estudio para empezar a recolectar datos.</Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-foreground/5 text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2">Sesión</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Dispositivo</th>
                {config.dimensions.map((d) => (
                  <th key={d.id} className="px-3 py-2">
                    D · {d.name}
                  </th>
                ))}
                <th className="px-3 py-2">Calidad</th>
                <th className="px-3 py-2">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((s) => (
                <tr key={s.id} className={s.excluded ? "opacity-50" : undefined}>
                  <td className="px-3 py-2">
                    <Link href={`/studies/${id}/data/${s.id}`} className="font-mono text-xs text-heading hover:underline">
                      {s.participant_ref}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{STATUS_LABEL[s.status]}</td>
                  <td className="whitespace-nowrap px-3 py-2">{new Date(s.started_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-3 py-2">
                    {DEVICE_LABEL[s.device_type]}
                    <span className="text-xs text-muted"> · {s.input_mode === "touch" ? "táctil" : "teclado"}</span>
                  </td>
                  {s.dimensions.map((r, i) => (
                    <td key={i} className="px-3 py-2 tabular-nums">
                      {r?.d_score !== null && r?.d_score !== undefined ? r.d_score.toFixed(2) : "—"}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2">{s.allValid === null ? "—" : validityText(s.allValid)}</td>
                  <td className="px-3 py-2 text-xs">
                    {s.excluded ? <span className="rounded bg-foreground/10 px-1.5 py-0.5">Excluida</span> : null}{" "}
                    {s.duplicate_flag ? <span className="rounded bg-warning/20 px-1.5 py-0.5">Posible duplicado</span> : null}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6 + config.dimensions.length} className="px-3 py-6 text-center text-muted">
                    Ninguna sesión coincide con los filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Página {page} de {pages} · {filtered.length} sesiones
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link className={buttonClass("secondary", "h-9")} href={`/studies/${id}/data${query({ page: String(page - 1) })}`}>
                ← Anterior
              </Link>
            ) : null}
            {page < pages ? (
              <Link className={buttonClass("secondary", "h-9")} href={`/studies/${id}/data${query({ page: String(page + 1) })}`}>
                Siguiente →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
