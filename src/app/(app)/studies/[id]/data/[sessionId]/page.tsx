import { notFound } from "next/navigation";
import { z } from "zod";
import { StudyTabs } from "@/components/study-tabs";
import { Breadcrumbs, projectCrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { fetchAll, loadStudyForResearcher } from "@/lib/studies";
import { DEVICE_LABEL, FLAG_LABEL, STATUS_LABEL, interpretationText, validityText } from "@/tools/iat/results/labels";
import { formatExtraAnswer } from "@/tools/iat/participant";
import { loadSessionViews } from "@/tools/iat/results/load";
import type { TrialExportRow } from "@/tools/iat/results/views";
import { setSessionExcluded } from "../actions";

export const metadata = { title: "Sesión · NeuroFusion" };

export default async function SessionDetailPage({ params }: PageProps<"/studies/[id]/data/[sessionId]">) {
  const { id, sessionId } = await params;
  if (!z.string().uuid().safeParse(sessionId).success) notFound();
  const { supabase } = await requireUser();
  const { study, config, projectName } = await loadStudyForResearcher(supabase, id);
  const view = (await loadSessionViews(supabase, id, config)).find((v) => v.id === sessionId);
  if (!view) notFound();

  const trials = await fetchAll<TrialExportRow>((from, to) =>
    supabase
      .from("trials")
      .select("session_id, dimension_idx, block, trial_idx, category, stimulus, correct_side, pressed_side, rt_ms, error")
      .eq("session_id", sessionId)
      .order("dimension_idx")
      .order("block")
      .order("trial_idx")
      .range(from, to)
      .returns<TrialExportRow[]>(),
  );

  const demo = view.demographics ?? {};
  const explicitLabel =
    view.explicit_preference === "A" ? config.conceptA.label : view.explicit_preference === "B" ? config.conceptB.label : view.explicit_preference === "neutral" ? "Ninguna / me da igual" : "—";
  const fields: [string, string][] = [
    ["Estado", STATUS_LABEL[view.status]],
    ["Inicio", new Date(view.started_at).toLocaleString("es-MX")],
    ["Fin", view.completed_at ? new Date(view.completed_at).toLocaleString("es-MX") : "—"],
    ["Dispositivo", `${DEVICE_LABEL[view.device_type]} · ${view.input_mode === "touch" ? "táctil" : "teclado"} · ${view.screen_width ?? "?"}×${view.screen_height ?? "?"}`],
    ["Preferencia explícita", explicitLabel],
    ...(config.participant.collectAge ? ([["Edad", String(demo.age ?? "—")]] as [string, string][]) : []),
    ...(config.participant.collectGender ? ([["Género", String(demo.gender ?? "—")]] as [string, string][]) : []),
    ...config.participant.extraFields.map((f): [string, string] => [f.label, formatExtraAnswer(f, demo[f.id])]),
  ];

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            ...projectCrumbs(study.project_id, projectName),
            { label: study.name, href: `/studies/${id}` },
            { label: "Datos", href: `/studies/${id}/data` },
          ]}
        />
        <h1 className="mt-1 font-display text-xl font-semibold tabular-nums">{view.participant_ref}</h1>
      </div>
      <StudyTabs id={id} active="data" />

      <Card className="space-y-3">
        <h2 className="font-medium">Participante</h2>
        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[180px_1fr]">
          {fields.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {view.duplicate_flag ? <p className="text-sm text-warning">Marcada como posible duplicado (misma IP y navegador que otra sesión).</p> : null}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Resultados por dimensión</h2>
        {view.status !== "completed" ? <p className="text-sm text-muted">Esta sesión no se completó, por lo que no tiene resultados.</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs font-semibold text-muted">
              <tr>
                <th className="py-2 pr-4">Dimensión</th>
                <th className="py-2 pr-4">D</th>
                <th className="py-2 pr-4">Interpretación</th>
                <th className="py-2 pr-4">Calidad</th>
                <th className="py-2 pr-4">Error</th>
                <th className="py-2 pr-4">&lt; 300 ms</th>
                <th className="py-2">N usados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {config.dimensions.map((d, i) => {
                const r = view.dimensions[i];
                return (
                  <tr key={d.id}>
                    <td className="py-2 pr-4">{d.name}</td>
                    <td className="py-2 pr-4 tabular-nums">{r?.d_score != null ? r.d_score.toFixed(3) : "—"}</td>
                    <td className="py-2 pr-4">{interpretationText(config, i, r)}</td>
                    <td className="py-2 pr-4">
                      {r ? validityText(r.valid) : "—"}
                      {r && r.flags.length ? <div className="text-xs text-muted">{r.flags.map((f) => FLAG_LABEL[f] ?? f).join("; ")}</div> : null}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{r ? `${(r.error_rate * 100).toFixed(1)} %` : "—"}</td>
                    <td className="py-2 pr-4 tabular-nums">{r ? `${(r.fast_fraction * 100).toFixed(1)} %` : "—"}</td>
                    <td className="py-2 tabular-nums">{r ? `${r.n_used} / ${r.n_trials}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Excluir del análisis</h2>
        <form action={setSessionExcluded} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="studyId" value={id} />
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="excluded" value={view.excluded ? "false" : "true"} />
          {!view.excluded ? (
            <label className="space-y-1 text-sm">
              <span className="text-muted">Motivo (opcional)</span>
              <input name="reason" maxLength={200} className="block h-10 w-72 rounded-md border border-control bg-background px-3 text-sm" placeholder="Ej. duplicado, respondió al azar" />
            </label>
          ) : (
            <p className="text-sm text-muted">Excluida{view.excluded_reason ? `: ${view.excluded_reason}` : ""}.</p>
          )}
          <Button type="submit" variant={view.excluded ? "secondary" : "danger"}>
            {view.excluded ? "Reincorporar al análisis" : "Excluir del análisis"}
          </Button>
        </form>
      </Card>

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">Ensayos ({trials.length})</summary>
        <div className="mt-3 max-h-[480px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-background text-muted">
              <tr>
                <th className="py-1 pr-3">Dim</th>
                <th className="py-1 pr-3">Bloque</th>
                <th className="py-1 pr-3">#</th>
                <th className="py-1 pr-3">Cat.</th>
                <th className="py-1 pr-3">Estímulo</th>
                <th className="py-1 pr-3">Correcta</th>
                <th className="py-1 pr-3">1.ª resp.</th>
                <th className="py-1 pr-3">RT (ms)</th>
                <th className="py-1">Error</th>
              </tr>
            </thead>
            <tbody>
              {trials.map((t) => (
                <tr key={`${t.dimension_idx}-${t.block}-${t.trial_idx}`} className={t.error ? "bg-danger/10" : undefined}>
                  <td className="py-0.5 pr-3">{config.dimensions[t.dimension_idx]?.name}</td>
                  <td className="py-0.5 pr-3">{t.block}</td>
                  <td className="py-0.5 pr-3">{t.trial_idx}</td>
                  <td className="py-0.5 pr-3">{t.category}</td>
                  <td className="py-0.5 pr-3">{t.stimulus}</td>
                  <td className="py-0.5 pr-3">{t.correct_side}</td>
                  <td className="py-0.5 pr-3">{t.pressed_side}</td>
                  <td className="py-0.5 pr-3 tabular-nums">{t.rt_ms.toFixed(1)}</td>
                  <td className="py-0.5">{t.error ? "sí" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
