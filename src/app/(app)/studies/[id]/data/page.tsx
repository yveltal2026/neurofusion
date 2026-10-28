import Link from "next/link";
import { StudyTabs } from "@/components/study-tabs";
import { Breadcrumbs, projectCrumbs } from "@/components/ui/breadcrumbs";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/brand/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatStrip } from "@/components/ui/stat-strip";
import { requireUser } from "@/lib/auth/session";
import { loadStudyForResearcher } from "@/lib/studies";
import { loadSessionViews } from "@/tools/iat/results/load";
import { DEVICE_LABEL, STATUS_LABEL, validityText } from "@/tools/iat/results/labels";
import { filterViews, type ViewFilters } from "@/tools/iat/results/views";

export const metadata = { title: "Datos · NeuroFusion" };

const PAGE_SIZE = 25;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

export default async function DataPage({ params, searchParams }: PageProps<"/studies/[id]/data">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { study, config, projectName } = await loadStudyForResearcher(supabase, id);
  const all = await loadSessionViews(supabase, id, config);

  const filters: ViewFilters = {
    status: pick(one(sp.status), ["all", "completed", "started", "abandoned"] as const, "all"),
    validity: pick(one(sp.validity), ["all", "valid", "invalid"] as const, "all"),
    device: pick(one(sp.device), ["all", "desktop", "mobile", "tablet"] as const, "all"),
    duplicates: pick(one(sp.dup), ["all", "only"] as const, "all"),
    excluded: pick(one(sp.excluded), ["all", "hide", "only"] as const, "all"),
  };
  const sortKeys = ["date", "ref", ...config.dimensions.map((_, i) => `d${i}`)];
  const sort = pick(one(sp.sort), sortKeys, "date");
  const defaultDir = (key: string) => (key === "ref" ? "asc" : "desc");
  const dir = pick(one(sp.dir), ["asc", "desc"] as const, defaultDir(sort));
  const sortValue = (s: (typeof all)[number]): number | string => {
    if (sort === "ref") return s.participant_ref;
    if (sort === "date") return new Date(s.started_at).getTime();
    return s.dimensions[Number(sort.slice(1))]?.d_score ?? Number.NEGATIVE_INFINITY;
  };
  const filtered = filterViews(all, filters).sort((a, b) => {
    const x = sortValue(a);
    const y = sortValue(b);
    const c = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y), "es", { numeric: true }) : x - y;
    return dir === "asc" ? c : -c;
  });
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
    for (const [k, v] of Object.entries({ status: filters.status, validity: filters.validity, device: filters.device, dup: filters.duplicates, excluded: filters.excluded, sort: sort === "date" && dir === "desc" ? "" : sort, dir: sort === "date" && dir === "desc" ? "" : dir, ...extra })) {
      if (v && v !== "all") p.set(k, v);
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  /** Encabezado ordenable: enlace que alterna el sentido; `aria-sort` dice cuál columna manda. */
  const sortTh = (k: string, label: string, className = "") => {
    const active = sort === k;
    const next = active ? (dir === "asc" ? "desc" : "asc") : defaultDir(k);
    return (
      <th key={k} className={`px-3 py-2.5 ${className}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
        <Link href={`/studies/${id}/data${query({ sort: k, dir: next, page: "" })}`} className="inline-flex items-center gap-1 hover:text-neuro-ink">
          {label}
          <span aria-hidden="true" className={active ? "text-neuro-ink" : "text-muted/60"}>
            {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </Link>
      </th>
    );
  };

  /** Calidad de los datos de la sesión: lo primero que se revisa, con texto además de color. */
  const qualityBadges = (s: (typeof all)[number], compact = false) => (
    <>
      {s.allValid === null ? (
        "sin dato"
      ) : (
        <StatusBadge tone={s.allValid ? "success" : "warning"}>{compact ? (s.allValid ? "Válidos" : "Revisar") : validityText(s.allValid)}</StatusBadge>
      )}
      {s.excluded ? <StatusBadge tone="neutral">Excluida</StatusBadge> : null}
      {s.duplicate_flag ? <StatusBadge tone="warning">{compact ? "Duplicado" : "Posible duplicado"}</StatusBadge> : null}
    </>
  );

  const selectClass = "h-9 rounded-md border border-control bg-background px-2 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs items={projectCrumbs(study.project_id, projectName)} />
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{study.name}</h1>
      </div>
      <StudyTabs id={id} active="data" />

      <StatStrip
        items={[
          { icon: "check", label: "Completadas", value: stats.completed },
          { icon: "clock", label: "En curso", value: stats.started },
          { icon: "inbox", label: "Abandonadas", value: stats.abandoned },
          { icon: "alert", label: "Datos a revisar", value: stats.invalid, attention: true },
          { icon: "copy", label: "Posibles duplicados", value: stats.dup, attention: true },
          { icon: "ban", label: "Excluidas del análisis", value: stats.excluded },
          { icon: "device", label: "Desde celular o tableta", value: stats.mobile },
        ]}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-end gap-3">
          {sort !== "date" || dir !== "desc" ? (
            <>
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="dir" value={dir} />
            </>
          ) : null}
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
          <button type="submit" className={buttonClass("secondary", "", "sm")}>
            Filtrar
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/studies/${id}/export/session_summary`} className={buttonClass("secondary", "", "sm")}>
            <Icon name="download" className="size-5" />
            session_summary.csv
          </a>
          <a href={`/api/studies/${id}/export/raw_trials`} className={buttonClass("secondary", "", "sm")}>
            <Icon name="download" className="size-5" />
            raw_trials.csv
          </a>
        </div>
      </div>

      {all.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Aún no hay respuestas"
          action={
            <Link href={`/studies/${id}`} className={buttonClass("secondary")}>
              <Icon name="link" className="size-5" />
              Ir a la liga del estudio
            </Link>
          }
        >
          Comparte la liga del estudio con tus participantes para empezar a recolectar datos.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto md:overflow-visible">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-neuro-tint text-sm font-semibold text-heading">
              <tr>
                {sortTh("ref", "Sesión")}
                <th className="hidden px-3 py-2.5 md:table-cell">Calidad</th>
                <th className="hidden px-3 py-2.5 lg:table-cell">Estado</th>
                {sortTh("date", "Fecha", "hidden md:table-cell")}
                <th className="hidden px-3 py-2.5 md:table-cell">Dispositivo</th>
                {config.dimensions.map((d, i) => sortTh(`d${i}`, `D · ${d.name}`))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border border-b border-border">
              {rows.map((s) => (
                <tr key={s.id} className={s.excluded ? "opacity-60" : undefined}>
                  <td className="px-3 py-3">
                    <Link href={`/studies/${id}/data/${s.id}`} className="whitespace-nowrap font-display font-semibold tabular-nums text-neuro-ink hover:underline">
                      {s.participant_ref}
                    </Link>
                    <span className="mt-0.5 block text-xs text-muted md:hidden">{new Date(s.started_at).toLocaleDateString("es-MX", { dateStyle: "short" })}</span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5 md:hidden">{qualityBadges(s, true)}</span>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <span className="flex flex-wrap items-center gap-1.5">{qualityBadges(s)}</span>
                  </td>
                  <td className="hidden px-3 py-3 lg:table-cell">{STATUS_LABEL[s.status]}</td>
                  <td className="hidden whitespace-nowrap px-3 py-3 md:table-cell">{new Date(s.started_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="hidden whitespace-nowrap px-3 py-3 md:table-cell">
                    {DEVICE_LABEL[s.device_type]}
                    <span className="text-sm text-muted"> · {s.input_mode === "touch" ? "táctil" : "teclado"}</span>
                  </td>
                  {s.dimensions.map((r, i) => (
                    <td key={i} className="px-3 py-3 tabular-nums">
                      {r?.d_score !== null && r?.d_score !== undefined ? r.d_score.toFixed(2) : "sin dato"}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4 + config.dimensions.length} className="px-3 py-6 text-center text-muted">
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
              <Link className={buttonClass("secondary", "", "sm")} href={`/studies/${id}/data${query({ page: String(page - 1) })}`}>
                ← Anterior
              </Link>
            ) : null}
            {page < pages ? (
              <Link className={buttonClass("secondary", "", "sm")} href={`/studies/${id}/data${query({ page: String(page + 1) })}`}>
                Siguiente →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
