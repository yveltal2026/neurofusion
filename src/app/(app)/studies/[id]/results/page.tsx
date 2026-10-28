import Link from "next/link";
import { SensitivityChart, IfdChart, TaskSuccessChart } from "@/components/charts/visual-charts";
import { StudyHeader } from "@/components/study-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import type { FrictionRatingRow, IfdMeasurementRow } from "@/lib/db/types";
import { createRemeasurement } from "@/tools/visual/actions";
import { loadVisualStudyPage } from "@/tools/visual/load";
import type { SensitivityRow, SiteSummary } from "@/tools/visual/journey/model";
import { missingRatings } from "@/tools/visual/journey/ratings";
import { rubricItems } from "@/tools/visual/journey/rubric";
import { MethodNote } from "@/tools/visual/ui/journey-views";
import { RunIfdForm } from "@/tools/visual/ui/forms";

export const metadata = { title: "Resultados IFD · NeuroFusion" };

export default async function ResultsPage({ params }: PageProps<"/studies/[id]/results">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const loaded = await loadVisualStudyPage(supabase, id, "journey");
  const { study, projectName } = loaded;
  const config = loaded.config as Extract<typeof loaded.config, { mode: "journey" }>;

  const { data: ratingRows } = await supabase.from("friction_ratings").select("site_key, item_key").eq("study_id", id).returns<FrictionRatingRow[]>();
  const pending = config.sites.map((s) => ({ site: s.name, missing: missingRatings(config, ratingRows ?? [], s.key).length }));
  const ready = pending.every((p) => p.missing === 0);

  const { data: rows } = await supabase.from("ifd_measurements").select("*").eq("study_id", id).order("created_at", { ascending: false }).returns<IfdMeasurementRow[]>();
  const measurements = rows ?? [];
  const latestRun = measurements[0]?.run_id;
  const latest = measurements.filter((m) => m.run_id === latestRun).sort((a, b) => a.ifd - b.ifd);
  const runs = [...new Map(measurements.map((m) => [m.run_id, m.created_at])).entries()];

  // Serie histórica: mismas URLs en otros estudios del proyecto (re-mediciones).
  const { data: siblings } = await supabase.from("studies").select("id, name").eq("project_id", study.project_id).eq("tool_type", "visual");
  const siblingIds = (siblings ?? []).map((s) => s.id);
  const { data: history } = siblingIds.length
    ? await supabase
        .from("ifd_measurements")
        .select("study_id, site_name, site_url, ifd, reading, created_at, engine_version, ifd_version")
        .in("study_id", siblingIds)
        .in("site_url", config.sites.map((s) => s.url))
        .order("created_at", { ascending: true })
        .returns<IfdMeasurementRow[]>()
    : { data: [] as IfdMeasurementRow[] };
  const studyName = new Map((siblings ?? []).map((s) => [s.id, s.name as string]));

  // El color sigue al sitio (posición en el diseño), no a su lugar en el ranking.
  const colorOf = (key: string) => Math.max(0, config.sites.findIndex((s) => s.key === key));
  const byConfigOrder = (ms: IfdMeasurementRow[]) => [...ms].sort((a, b) => colorOf(a.site_key) - colorOf(b.site_key));
  const taskRows = config.tasks.map((t) => ({
    task: t.id,
    ...Object.fromEntries(latest.map((m) => [m.site_name, (m.summary as SiteSummary).successByTask[t.id] ?? 0])),
  }));
  const label = (k: string) => {
    const it = rubricItems(config.tasks).find((i) => i.key === k);
    return it ? it.label.replace(/^Éxito base · /, "Base ") : k;
  };

  return (
    <div className="space-y-8">
      <StudyHeader study={study} projectName={projectName} active="results" variant="journey" subtitle="Índice de Fricción Digital" />

      <Card className="space-y-3">
        <div>
          <h2 className="font-medium">Calcular</h2>
          <p className="text-sm text-muted">
            Todos los sitios se simulan con el mismo panel modelado y la misma semilla ({config.panel.seed}), así las diferencias reflejan sólo las
            calificaciones. Cada corrida queda guardada con sus versiones.
          </p>
        </div>
        {!ready ? (
          <Alert tone="warning">
            Faltan calificaciones: {pending.filter((p) => p.missing).map((p) => `${p.site} (${p.missing})`).join(", ")}.{" "}
            <Link href={`/studies/${id}/ratings`} className="underline">
              Ir a calificación
            </Link>
          </Alert>
        ) : null}
        <RunIfdForm studyId={id} ready={ready} />
      </Card>

      {latest.length ? (
        <>
          <section className="space-y-3">
            <h2 className="font-medium">Última medición · {new Date(latest[0].created_at).toLocaleString("es-MX")}</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-neuro-wash text-xs font-semibold text-muted">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Sitio</th>
                    <th className="px-3 py-2">IFD</th>
                    <th className="px-3 py-2">Lectura</th>
                    <th className="px-3 py-2">Éxito prom.</th>
                    <th className="px-3 py-2">SUS</th>
                    <th className="px-3 py-2">Confianza</th>
                    <th className="px-3 py-2">Carga</th>
                    <th className="px-3 py-2">Abandono login</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {latest.map((m, i) => {
                    const s = m.summary as SiteSummary;
                    return (
                      <tr key={m.id} className={m.is_competitor ? "" : "font-medium"}>
                        <td className="px-3 py-2">{i + 1}</td>
                        <td className="px-3 py-2">
                          {m.site_name}
                          {m.is_competitor ? "" : " (principal)"}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{m.ifd.toFixed(1)}</td>
                        <td className="px-3 py-2">{m.reading}</td>
                        <td className="px-3 py-2 tabular-nums">{s.successAvg.toFixed(1)} %</td>
                        <td className="px-3 py-2 tabular-nums">{s.susAvg.toFixed(1)}</td>
                        <td className="px-3 py-2 tabular-nums">{s.trustAvg.toFixed(2)} / 5</td>
                        <td className="px-3 py-2 tabular-nums">{s.loadAvg.toFixed(2)} / 7</td>
                        <td className="px-3 py-2 tabular-nums">{s.abandonPct.toFixed(1)} %</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <IfdChart rows={latest.map((m) => ({ site: m.site_name, ifd: m.ifd, reading: m.reading, colorIndex: colorOf(m.site_key) }))} />
              <TaskSuccessChart rows={taskRows} sites={byConfigOrder(latest).map((m) => ({ name: m.site_name, colorIndex: colorOf(m.site_key) }))} />
            </div>
            <details className="rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer font-medium text-heading">Ver los datos de las gráficas en tabla</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Éxito estimado por tarea y sitio</caption>
                  <thead className="text-xs font-semibold text-muted">
                    <tr>
                      <th className="py-1 pr-3">Tarea</th>
                      {byConfigOrder(latest).map((m) => (
                        <th key={m.id} className="py-1 pr-3">
                          {m.site_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {config.tasks.map((t) => (
                      <tr key={t.id}>
                        <td className="py-1 pr-3">
                          {t.id} · {t.name}
                        </td>
                        {byConfigOrder(latest).map((m) => (
                          <td key={m.id} className="py-1 pr-3 tabular-nums">
                            {((m.summary as SiteSummary).successByTask[t.id] ?? 0).toFixed(1)} %
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            {latest.flatMap((m) => (m.summary as SiteSummary).alerts.map((a) => `${m.site_name}: ${a}`)).map((a) => (
              <Alert key={a} tone="warning">
                {a}
              </Alert>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="font-medium">¿Qué calificaciones mueven el IFD?</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {latest.map((m) => {
                const sens = ((m.inputs as { sensitivity?: SensitivityRow[] }).sensitivity ?? []).slice(0, 8);
                return (
                  <SensitivityChart
                    key={m.id}
                    title={m.site_name}
                    rows={sens.map((r) => ({ label: label(r.item), down: Math.round((r.down - r.base) * 10) / 10, up: Math.round((r.up - r.base) * 10) / 10 }))}
                  />
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-medium">Desglose por segmento (sitio principal)</h2>
            {(() => {
              const main = latest.find((m) => !m.is_competitor) ?? latest[0];
              const s = main.summary as SiteSummary;
              return (
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    ["Edad", s.byAge],
                    ["Alfabetización digital", s.byLiteracy],
                  ].map(([title, data]) => (
                    <div key={title as string} className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-neuro-wash text-xs font-semibold text-muted">
                          <tr>
                            <th className="px-3 py-2">{title as string}</th>
                            <th className="px-3 py-2">Perfiles</th>
                            <th className="px-3 py-2">Éxito prom.</th>
                            <th className="px-3 py-2">SUS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(data as SiteSummary["byAge"]).map((g) => (
                            <tr key={g.group}>
                              <td className="px-3 py-2">{g.group}</td>
                              <td className="px-3 py-2 tabular-nums">{g.n}</td>
                              <td className="px-3 py-2 tabular-nums">{g.successAvg.toFixed(1)} %</td>
                              <td className="px-3 py-2 tabular-nums">{g.sus.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>
          <MethodNote measurement={latest[0]} />
        </>
      ) : (
        <EmptyState icon="results" title="Aún no hay mediciones">
          Cuando haya calificaciones del recorrido verás aquí los resultados del IFD.
        </EmptyState>
      )}

      {runs.length > 1 ? (
        <section className="space-y-2">
          <h2 className="font-medium">Corridas de este estudio</h2>
          <ul className="space-y-1 text-sm">
            {runs.map(([run, at]) => (
              <li key={run}>
                {new Date(at).toLocaleString("es-MX")} ·{" "}
                {measurements
                  .filter((m) => m.run_id === run)
                  .map((m) => `${m.site_name} ${m.ifd.toFixed(1)}`)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(history ?? []).some((h) => h.study_id !== id) ? (
        <section className="space-y-2">
          <h2 className="font-medium">Serie histórica en el proyecto</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-neuro-wash text-xs font-semibold text-muted">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Estudio</th>
                  <th className="px-3 py-2">Sitio</th>
                  <th className="px-3 py-2">IFD</th>
                  <th className="px-3 py-2">Versiones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(history ?? []).map((h, i) => (
                  <tr key={`${h.study_id}-${h.site_url}-${i}`}>
                    <td className="px-3 py-2">{new Date(h.created_at).toLocaleDateString("es-MX")}</td>
                    <td className="px-3 py-2">{studyName.get(h.study_id) ?? "—"}</td>
                    <td className="px-3 py-2">{h.site_name}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {h.ifd.toFixed(1)} · {h.reading}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {h.engine_version} · {h.ifd_version}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Compara sólo mediciones con la misma versión de motor e IFD.</p>
        </section>
      ) : null}

      <form action={createRemeasurement} className="print:hidden">
        <input type="hidden" name="studyId" value={id} />
        <Button type="submit" variant="secondary">
          Crear re-medición (mismo diseño, calificar de nuevo)
        </Button>
      </form>
    </div>
  );
}
