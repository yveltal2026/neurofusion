import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/studies";
import { refreshParticipationActivity } from "@/lib/participation-activity-server";
import {
  participationLabel,
  participationStatus,
  type ParticipationActivity,
} from "@/lib/participation-activity";
import { ActivityRefresh } from "./activity-refresh";
import { Block } from "./ui/card";

async function loadParticipationSnapshot(studyId: string) {
  const supabase = await createClient();
  await refreshParticipationActivity(supabase, "study", studyId);
  const sessions = await fetchAll<
    ParticipationActivity & { id: string; participant_ref: string }
  >((from, to) =>
    supabase
      .from("sessions")
      .select(
        "id, participant_ref, status, started_at, last_activity_at, inactive_since, abandon_reason",
      )
      .eq("study_id", studyId)
      .order("started_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return { sessions, now: Date.now() };
}

export async function StudyParticipationSummary({
  studyId,
}: {
  studyId: string;
}) {
  const { sessions, now } = await loadParticipationSnapshot(studyId);
  return (
    <Block className="mt-8 space-y-3">
      <ActivityRefresh />
      <h2 className="text-xl font-semibold">Estado de las participaciones</h2>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            ["started", "En progreso"],
            ["inactive", "Inactivas"],
            ["completed", "Completadas"],
            ["abandoned", "Abandonadas"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-2xl font-semibold">
              {
                sessions.filter((s) => participationStatus(s, now) === key)
                  .length
              }
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted">
        Inactiva al ocultar o cerrar la página, o tras 2 minutos sin señal.
        Abandonada después de 30 minutos sin actividad. Se actualiza cada 30
        segundos; abrir una liga sin iniciar no cuenta como participación.
      </p>
      {sessions.length ? (
        <details>
          <summary className="cursor-pointer text-sm">
            Ver participaciones recientes
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="py-2">Código</th>
                  <th>Estado</th>
                  <th>Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 30).map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-2">{s.participant_ref}</td>
                    <td>{participationLabel(s, now)}</td>
                    <td>
                      {new Date(
                        s.last_activity_at ?? s.started_at,
                      ).toLocaleString("es-MX", {
                        timeZone: "America/Mexico_City",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : (
        <p className="text-sm text-muted">Aún no hay participaciones.</p>
      )}
    </Block>
  );
}
