export const HEARTBEAT_MS = 30_000;
export const INACTIVE_MS = 2 * 60_000;
export const ABANDONED_MS = 30 * 60_000;

export interface ParticipationActivity {
  status: "started" | "completed" | "abandoned";
  started_at: string;
  last_activity_at?: string;
  inactive_since?: string | null;
  abandon_reason?: string | null;
}
export type ParticipationStatus = ParticipationActivity["status"] | "inactive";

/** Presence changes labels, never scores or responses. Pre-migration rows keep their canonical state. */
export function participationStatus(
  session: ParticipationActivity,
  now = Date.now(),
): ParticipationStatus {
  if (session.status !== "started") return session.status;
  if (!session.last_activity_at && !session.inactive_since) return "started";
  const last = new Date(
    session.inactive_since ?? session.last_activity_at ?? session.started_at,
  ).getTime();
  if (now - last >= ABANDONED_MS) return "abandoned";
  if (session.inactive_since || now - last >= INACTIVE_MS) return "inactive";
  return "started";
}

export const PARTICIPATION_LABEL: Record<ParticipationStatus, string> = {
  started: "En progreso",
  inactive: "Inactiva",
  completed: "Completada",
  abandoned: "Abandonada",
};
export function participationLabel(
  session: ParticipationActivity,
  now = Date.now(),
): string {
  const state = participationStatus(session, now);
  return state === "abandoned" &&
    (session.abandon_reason === "inactivity" || session.status === "started")
    ? "Abandonada por inactividad"
    : PARTICIPATION_LABEL[state];
}
