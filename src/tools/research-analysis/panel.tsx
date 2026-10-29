import type { SupabaseClient } from "@supabase/supabase-js";
import { Alert } from "@/components/ui/alert";
import { Block } from "@/components/ui/card";
import { ResearchAnalysisForm } from "./form";
import { researchContextSchema, researchResultSchema } from "./schema";
import { snapshotKey } from "./snapshot";

export async function ResearchAnalysisPanel({
  supabase,
  id,
  kind,
  n,
  aggregates,
  canAnalyze = true,
}: {
  supabase: SupabaseClient;
  id: string;
  kind: "study" | "battery";
  n: number;
  aggregates: unknown;
  canAnalyze?: boolean;
}) {
  const { data: history, error } = await supabase
    .from("research_analyses")
    .select("id, context, result, aggregates, n_sessions, model, created_at")
    .eq(kind === "study" ? "study_id" : "battery_id", id)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(10);
  const context = researchContextSchema.safeParse(history?.[0]?.context);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Base actual: {n} participantes incluidos. La IA recibe agregados, sin
        respuestas individuales ni coordenadas de mirada. Sus conclusiones son
        interpretaciones y deben revisarse.
      </p>
      {n < 3 ? (
        <Alert tone="warning">
          Se necesitan al menos 3 participantes incluidos para analizar.
        </Alert>
      ) : null}
      {n >= 3 && !canAnalyze ? (
        <Alert tone="warning">
          Aún no hay una medida con al menos 3 participantes con datos
          utilizables. Revisa la calidad y las exclusiones.
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error">
          No se pudo cargar el historial de análisis. Inténtalo más tarde.
        </Alert>
      ) : null}
      <Block>
        <ResearchAnalysisForm
          id={id}
          kind={kind}
          context={context.success ? context.data : undefined}
          disabled={n < 3 || !canAnalyze || Boolean(error)}
        />
      </Block>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Historial de análisis</h2>
        {!history?.length && !error ? (
          <p className="text-sm text-muted">Aún no se han generado análisis.</p>
        ) : null}
        {history?.map((row, index) => {
          const result = researchResultSchema.safeParse(row.result);
          const savedContext = researchContextSchema.safeParse(row.context);
          const stale = snapshotKey(row.aggregates) !== snapshotKey(aggregates);
          return (
            <details
              key={row.id}
              open={index === 0}
              className="rounded-xl border border-border p-4"
            >
              <summary className="cursor-pointer font-semibold">
                {new Date(row.created_at).toLocaleString("es-MX", {
                  timeZone: "America/Mexico_City",
                })}{" "}
                · n = {row.n_sessions}
              </summary>
              <div className="mt-4 space-y-4">
                {stale ? (
                  <Alert tone="warning">
                    Los datos o las exclusiones cambiaron desde este análisis.
                    Genera uno nuevo para actualizarlos.
                  </Alert>
                ) : null}
                {savedContext.success ? (
                  <details>
                    <summary className="cursor-pointer text-sm">
                      Ver contexto utilizado
                    </summary>
                    <dl className="mt-2 space-y-2 text-sm">
                      {Object.entries(savedContext.data).map(([key, value]) => (
                        <div key={key}>
                          <dt className="font-medium">
                            {
                              {
                                material: "Material",
                                materialObjective: "Objetivo del material",
                                brandObjective: "Objetivo de la marca",
                                audience: "Público",
                                question: "Pregunta",
                              }[key]
                            }
                          </dt>
                          <dd className="whitespace-pre-wrap">
                            {value || "Sin especificar"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
                {result.success ? (
                  <>
                    <p className="whitespace-pre-wrap">{result.data.summary}</p>
                    {result.data.findings.map((finding, i) => (
                      <div key={i}>
                        <h3 className="font-semibold">{finding.title}</h3>
                        <p className="whitespace-pre-wrap text-sm">
                          {finding.evidence}
                        </p>
                      </div>
                    ))}
                    <h3 className="font-semibold">Recomendaciones</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {result.data.recommendations.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                    <h3 className="font-semibold">Limitaciones</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {result.data.limitations.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <Alert tone="warning">
                    Formato de análisis no reconocido. Genera uno nuevo.
                  </Alert>
                )}
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
