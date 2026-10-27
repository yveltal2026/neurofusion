import Link from "next/link";
import { StudyHeader } from "@/components/study-header";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { CRITERIA_LABEL } from "@/tools/visual/analysis/piece";
import { blindZones } from "@/tools/visual/engine/aoi";
import { describeMetrics } from "@/tools/visual/engine/metrics";
import { checkPlacement, getPlacement } from "@/tools/visual/engine/placements";
import { loadVisualStudyPage } from "@/tools/visual/load";
import { assetUrls, loadAssets } from "@/tools/visual/results";
import { ScoreDots } from "@/tools/visual/ui/asset-panels";

export const metadata = { title: "Comparativa · NeuroFusion" };

const KEYS = Object.keys(CRITERIA_LABEL) as (keyof typeof CRITERIA_LABEL)[];

export default async function ComparePage({ params }: PageProps<"/studies/[id]/compare">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { study, projectName } = await loadVisualStudyPage(supabase, id, "pieces");
  const assets = await loadAssets(supabase, id);
  const urls = await assetUrls(supabase, assets.map((a) => a.row.storage_path), "thumb");
  const avg = (a: (typeof assets)[number]) => (a.result ? KEYS.reduce((s, k) => s + a.result!.criteria[k].score, 0) / KEYS.length : null);
  const sorted = [...assets].sort((a, b) => (avg(b) ?? -1) - (avg(a) ?? -1));

  return (
    <div className="space-y-6">
      <StudyHeader study={study} projectName={projectName} active="compare" variant="pieces" subtitle="Comparativa de piezas" />
      {assets.length < 2 ? <Card className="text-sm text-muted">Sube y analiza al menos dos piezas para compararlas.</Card> : null}
      {assets.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-neuro-wash font-display text-xs font-semibold text-muted">
              <tr>
                <th className="px-3 py-2">Pieza</th>
                <th className="px-3 py-2">Promedio IA</th>
                {KEYS.map((k) => (
                  <th key={k} className="px-3 py-2">
                    {CRITERIA_LABEL[k]}
                  </th>
                ))}
                <th className="px-3 py-2">Zonas ciegas</th>
                <th className="px-3 py-2">Problemas altos</th>
                <th className="px-3 py-2">Saturación</th>
                <th className="px-3 py-2">Espacio negativo</th>
                <th className="px-3 py-2">Formato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((a) => {
                const spec = getPlacement(a.row.placement);
                const fails = spec ? checkPlacement(spec, a.row).filter((c) => !c.ok).length : null;
                const score = avg(a);
                return (
                  <tr key={a.row.id} className="align-middle">
                    <td className="min-w-56 px-3 py-2">
                      <Link href={`/studies/${id}/assets/${a.row.id}`} className="flex items-center gap-3 hover:underline">
                        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage */}
                        {urls[a.row.storage_path] ? <img src={urls[a.row.storage_path]} alt="" className="size-10 shrink-0 rounded object-cover" /> : null}
                        <span className="font-medium">{a.row.title}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{score === null ? "—" : score.toFixed(1)}</td>
                    {KEYS.map((k) => (
                      <td key={k} className="px-3 py-2">
                        {a.result ? <ScoreDots score={a.result.criteria[k].score} /> : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2 tabular-nums">{a.aois.length ? blindZones(a.aois).length : "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{a.result ? a.result.issues.filter((i) => i.severity === "high").length : "—"}</td>
                    <td className="px-3 py-2">{a.metrics ? describeMetrics(a.metrics).clutter : "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{a.metrics ? `${Math.round(a.metrics.negativeSpace * 100)} %` : "—"}</td>
                    <td className="px-3 py-2">{spec ? (fails ? `${fails} incumplimiento(s)` : "Cumple") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="text-xs text-muted">
        Los criterios son la lectura de la IA (1–5); saturación, espacio negativo y formato son medidas deterministas de la imagen. Compara variantes de
        una misma campaña con el mismo objetivo; para validar con personas reales, combina con un estudio IAT.
      </p>
    </div>
  );
}
