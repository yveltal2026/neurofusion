import Link from "next/link";
import { z } from "zod";
import { StudyHeader } from "@/components/study-header";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import type { FrictionRatingRow } from "@/lib/db/types";
import { loadVisualStudyPage } from "@/tools/visual/load";
import { missingRatings } from "@/tools/visual/journey/ratings";
import { RUBRIC_VERSION, rubricItems } from "@/tools/visual/journey/rubric";
import { loadAssets } from "@/tools/visual/results";
import { RatingItemForm, SuggestRatingsForm, type Suggestion } from "@/tools/visual/ui/forms";

export const metadata = { title: "Calificación · NeuroFusion" };
// Las sugerencias de IA revisan varias capturas.
export const maxDuration = 120;

const storedSuggestions = z.object({
  suggestions: z.array(
    z.object({
      item: z.string(),
      value: z.number(),
      justification: z.string(),
      evidenceAssetId: z.string().nullable(),
      confidence: z.enum(["low", "medium", "high"]),
    }),
  ),
  notObservable: z.array(z.string()),
});

export default async function RatingsPage({ params, searchParams }: PageProps<"/studies/[id]/ratings">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const loaded = await loadVisualStudyPage(supabase, id, "journey");
  const { study, projectName } = loaded;
  const config = loaded.config as Extract<typeof loaded.config, { mode: "journey" }>;
  const siteKey = typeof sp.site === "string" && config.sites.some((s) => s.key === sp.site) ? sp.site : config.sites[0].key;
  const site = config.sites.find((s) => s.key === siteKey)!;

  const { data: ratingRows } = await supabase.from("friction_ratings").select("*").eq("study_id", id).returns<FrictionRatingRow[]>();
  const ratings = ratingRows ?? [];
  const assets = (await loadAssets(supabase, id)).filter((a) => a.row.site_key === siteKey);
  const evidence = assets.map((a) => ({ id: a.row.id, label: `${a.row.task_id} · ${a.row.title}` }));
  const { data: sugRow } = await supabase
    .from("friction_suggestions")
    .select("result, model, created_at")
    .eq("study_id", id)
    .eq("site_key", siteKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sug = sugRow ? storedSuggestions.safeParse(sugRow.result) : null;
  const suggestionFor = (key: string): Suggestion | null => {
    const s = sug?.success ? sug.data.suggestions.find((x) => x.item === key) : null;
    return s ? { value: s.value, justification: s.justification, evidenceAssetId: s.evidenceAssetId, confidence: s.confidence } : null;
  };
  const items = rubricItems(config.tasks);

  return (
    <div className="space-y-6">
      <StudyHeader study={study} projectName={projectName} active="ratings" variant="journey" subtitle={`Rúbrica ${RUBRIC_VERSION}`} />

      <Alert tone="warning">
        Rúbrica provisional: las anclas son genéricas y se reemplazarán con la rúbrica oficial de fricciones. Regla de oro: toda calificación cita
        evidencia (captura y observación). Las calificaciones determinan casi todo el resultado del modelo.
      </Alert>

      <nav className="flex flex-wrap gap-2" aria-label="Sitios">
        {config.sites.map((s) => {
          const missing = missingRatings(config, ratings, s.key).length;
          return (
            <Link
              key={s.key}
              href={`/studies/${id}/ratings?site=${s.key}`}
              aria-current={s.key === siteKey ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${s.key === siteKey ? "border-primary bg-primary/10 font-medium" : "border-border text-muted"}`}
            >
              {s.name} · {items.length - missing}/{items.length}
            </Link>
          );
        })}
      </nav>

      <Card className="space-y-3">
        <div>
          <h2 className="font-medium">Sugerencias de IA para {site.name}</h2>
          <p className="text-sm text-muted">
            La IA revisa hasta 8 capturas de este sitio y propone valores con justificación. Tú decides: cada sugerencia se revisa y se guarda a mano.
          </p>
        </div>
        <SuggestRatingsForm studyId={id} siteKey={siteKey} disabled={assets.length === 0} />
        {assets.length === 0 ? <p className="text-xs text-muted">Sube capturas de este sitio en la pestaña Capturas.</p> : null}
        {sug?.success ? (
          <p className="text-xs text-muted">
            Últimas sugerencias: {new Date(sugRow!.created_at).toLocaleString("es-MX")} · {sugRow!.model}
            {sug.data.notObservable.length ? ` · No observable: ${sug.data.notObservable.join("; ")}` : ""}
          </p>
        ) : null}
      </Card>

      <div className="space-y-3">
        {items.map((item) => {
          const cur = ratings.find((r) => r.site_key === siteKey && r.item_key === item.key);
          return (
            <RatingItemForm
              key={`${siteKey}-${item.key}-${cur?.updated_at ?? "new"}-${sugRow?.created_at ?? ""}`}
              studyId={id}
              siteKey={siteKey}
              item={item}
              current={cur ? { value: Number(cur.value), justification: cur.justification, evidenceAssetId: cur.evidence_asset_id, source: cur.source } : null}
              evidence={evidence}
              suggestion={suggestionFor(item.key)}
            />
          );
        })}
      </div>
    </div>
  );
}
