import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/studies";
import { Card } from "@/components/ui/card";
import { EyeResults } from "@/tools/eyetracking/ui/eye-results";
import {
  eyeObservationSchema,
  eyeQualitySchema,
} from "@/tools/visual/eye/schema";
import { assetUrls, loadAssets } from "@/tools/visual/results";
import type { BatteryDetail } from "../load";
import { chunk } from "../load";
import { surveyConfigSchema, listItems } from "@/tools/survey/engine";
import { iatConfigSchema } from "@/tools/iat/config";

interface Child {
  id: string;
  study_id: string;
  battery_session_id: string;
  status: string;
  excluded: boolean;
}
interface Result {
  session_id: string;
  dimension_idx: number;
  d_score: number | null;
  valid: boolean;
}
interface Answers {
  session_id: string;
  answers: Record<string, unknown>;
}
interface Variant {
  session_id: string;
  primary_value: number | null;
  valid: boolean;
}
interface Eye {
  session_id: string;
  validation: unknown;
  observations: unknown;
}

/** Researcher-only detail, scoped to the battery's child sessions. Never passed to AI. */
export async function BatteryParticipantResults({
  supabase,
  detail,
}: {
  supabase: SupabaseClient;
  detail: BatteryDetail;
}) {
  const children: Child[] = [];
  for (const ids of chunk(
    detail.sessions.map((s) => s.id),
    100,
  ))
    children.push(
      ...(await fetchAll<Child>((from, to) =>
        supabase
          .from("sessions")
          .select("id, study_id, battery_session_id, status, excluded")
          .in("battery_session_id", ids)
          .order("id")
          .range(from, to),
      )),
    );
  const results: Result[] = [],
    answers: Answers[] = [],
    variants: Variant[] = [],
    eyes: Eye[] = [];
  for (const ids of chunk(
    children.map((s) => s.id),
    100,
  )) {
    const [r, a, v, e] = await Promise.all([
      fetchAll<Result>((from, to) =>
        supabase
          .from("session_results")
          .select("session_id, dimension_idx, d_score, valid")
          .in("session_id", ids)
          .order("session_id")
          .order("dimension_idx")
          .range(from, to),
      ),
      fetchAll<Answers>((from, to) =>
        supabase
          .from("survey_answers")
          .select("session_id, answers")
          .in("session_id", ids)
          .order("session_id")
          .range(from, to),
      ),
      fetchAll<Variant>((from, to) =>
        supabase
          .from("variant_results")
          .select("session_id, primary_value, valid")
          .in("session_id", ids)
          .order("session_id")
          .range(from, to),
      ),
      fetchAll<Eye>((from, to) =>
        supabase
          .from("eye_tracking_runs")
          .select("session_id, validation, observations")
          .in("session_id", ids)
          .order("session_id")
          .range(from, to),
      ),
    ]);
    results.push(...r);
    answers.push(...a);
    variants.push(...v);
    eyes.push(...e);
  }
  const { data: studies, error } = detail.steps.length
    ? await supabase
        .from("studies")
        .select("id, config")
        .in(
          "id",
          detail.steps.map((s) => s.studyId),
        )
    : { data: [], error: null };
  if (error)
    throw new Error("No se pudieron consultar los estudios de la batería");
  const labels = new Map<string, Map<string, string>>();
  const dimensionNames = new Map<string, string[]>();
  for (const study of studies ?? []) {
    const config = surveyConfigSchema.safeParse(study.config);
    if (config.success)
      labels.set(
        study.id,
        new Map(listItems(config.data).map((item) => [item.id, item.label])),
      );
    const iat = iatConfigSchema.safeParse(study.config);
    if (iat.success)
      dimensionNames.set(
        study.id,
        iat.data.dimensions.map((d) => d.name),
      );
  }
  const stateName = (status: string) =>
    ({ completed: "Completado", started: "En curso", abandoned: "Abandonado" })[
      status
    ] ?? status;
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Resultados por participante</h2>
      <p className="text-sm text-muted">
        Abre un código para consultar sus pasos y respuestas en esta página. Los
        registros excluidos se muestran para revisión y no entran al análisis.
      </p>
      {!detail.sessions.length ? (
        <p className="text-sm text-muted">Aún no hay participantes.</p>
      ) : null}
      {detail.sessions.map((participant) => (
        <details
          key={participant.id}
          className="rounded-xl border border-border p-4"
        >
          <summary className="cursor-pointer font-semibold">
            {participant.participantRef} · {stateName(participant.status)}
            {participant.excluded ? " · Excluido" : ""}
          </summary>
          <div className="mt-4 space-y-4">
            {detail.steps.map((step) => {
              const mine = children.filter(
                (s) =>
                  s.battery_session_id === participant.id &&
                  s.study_id === step.studyId,
              );
              return (
                <div
                  key={step.studyId}
                  className="space-y-2 border-t border-border pt-3"
                >
                  <h3 className="font-semibold">{step.name}</h3>
                  {!mine.length ? (
                    <p className="text-sm text-muted">
                      {step.enabled ? "Pendiente" : "Paso omitido"}
                    </p>
                  ) : (
                    mine.map((session) => (
                      <div key={session.id} className="space-y-2 text-sm">
                        <p>
                          {stateName(session.status)}
                          {session.excluded ? " · Excluido" : ""}
                        </p>
                        {results
                          .filter((r) => r.session_id === session.id)
                          .map((r) => (
                            <p key={r.dimension_idx}>
                              {dimensionNames.get(step.studyId)?.[
                                r.dimension_idx
                              ] ?? `Dimensión ${r.dimension_idx + 1}`}
                              : D = {r.d_score?.toFixed(3) ?? "sin dato"} ·{" "}
                              {r.valid ? "Válido" : "Calidad insuficiente"}
                            </p>
                          ))}
                        {variants
                          .filter((r) => r.session_id === session.id)
                          .map((r) => (
                            <p key={r.session_id}>
                              Medida principal:{" "}
                              {r.primary_value?.toFixed(3) ?? "sin dato"} ·{" "}
                              {r.valid ? "Válido" : "Calidad insuficiente"}
                            </p>
                          ))}
                        {answers
                          .filter((r) => r.session_id === session.id)
                          .map((r) => (
                            <dl key={r.session_id} className="space-y-2">
                              {Object.entries(r.answers).map(([key, value]) => (
                                <div key={key}>
                                  <dt className="font-medium">
                                    {labels.get(step.studyId)?.get(key) ?? key}
                                  </dt>
                                  <dd className="whitespace-pre-wrap break-words">
                                    {Array.isArray(value)
                                      ? value.join(", ")
                                      : value === null
                                        ? "Sin respuesta"
                                        : typeof value === "object"
                                          ? JSON.stringify(value)
                                          : String(value)}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ))}
                        {step.toolType === "visual" &&
                        session.status === "completed" ? (
                          <p>Exposición a las imágenes completada.</p>
                        ) : null}
                        {eyes
                          .filter((r) => r.session_id === session.id)
                          .map((r) => {
                            const quality = eyeQualitySchema.safeParse(
                              r.validation,
                            );
                            return (
                              <p key={r.session_id}>
                                Miradas guardadas ·{" "}
                                {quality.success &&
                                quality.data.passed &&
                                quality.data.measurementStatus !== "limited"
                                  ? "Calidad aceptable"
                                  : "Fuera del análisis por calidad"}
                                . Consulta los mapas por código más abajo.
                              </p>
                            );
                          })}
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </details>
      ))}
      {await Promise.all(
        detail.steps
          .filter((step) => step.toolType === "eyetracking")
          .map(async (step) => {
            const assets = await loadAssets(supabase, step.studyId);
            const urls = await assetUrls(
              supabase,
              assets.map((a) => a.row.storage_path),
              "view",
            );
            return (
              <section key={step.studyId} className="space-y-4">
                <h3 className="text-lg font-semibold">Miradas · {step.name}</h3>
                <p className="text-sm text-muted">
                  Selecciona un participante en cada mapa. Solo se incluyen
                  baterías completadas, sin exclusiones y con calidad aceptable.
                </p>
                {assets.map((asset) => {
                  const seenParticipants = new Set<string>();
                  const participants = eyes.flatMap((run) => {
                    const child = children.find(
                      (s) =>
                        s.id === run.session_id &&
                        s.study_id === step.studyId &&
                        s.status === "completed" &&
                        !s.excluded,
                    );
                    const participant = detail.sessions.find(
                      (s) =>
                        s.id === child?.battery_session_id &&
                        s.status === "completed" &&
                        !s.excluded,
                    );
                    const anyExcluded = children.some(
                      (s) =>
                        s.battery_session_id === participant?.id &&
                        s.status === "completed" &&
                        s.excluded,
                    );
                    const quality = eyeQualitySchema.safeParse(run.validation);
                    const observations = eyeObservationSchema
                      .array()
                      .safeParse(run.observations);
                    const accepted =
                      child &&
                      participant &&
                      !anyExcluded &&
                      quality.success &&
                      quality.data.passed &&
                      quality.data.measurementStatus !== "limited" &&
                      observations.success &&
                      observations.data.some((o) => o.samples.length > 0);
                    if (
                      !accepted ||
                      !participant ||
                      !observations.success ||
                      seenParticipants.has(participant.id)
                    )
                      return [];
                    seenParticipants.add(participant.id);
                    return observations.data
                      .filter((o) => o.assetId === asset.row.id)
                      .map((observation) => ({
                        sessionId: run.session_id,
                        participant: participant.participantRef,
                        observation,
                      }));
                  });
                  return (
                    <Card key={asset.row.id}>
                      <EyeResults
                        studyId={step.studyId}
                        assetId={asset.row.id}
                        title={asset.row.title}
                        imageUrl={urls[asset.row.storage_path]}
                        width={asset.row.width}
                        height={asset.row.height}
                        aois={asset.aois}
                        participants={participants}
                      />
                    </Card>
                  );
                })}
              </section>
            );
          }),
      )}
    </section>
  );
}
