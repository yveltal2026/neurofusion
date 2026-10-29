import { isBatteryComplete, stepProgress, type StepStatus } from "./config";
import { participationStatus, type ParticipationStatus } from "@/lib/participation-activity";

/**
 * Resumen de una batería para el investigador: cuántos participantes hay, cuántos terminaron cada
 * paso y el estado de cada participante. Código puro; el estado de cada paso se DERIVA de las
 * sesiones hijas (igual que en el servidor del participante).
 */

export interface SummarySession {
  id: string;
  participantRef: string;
  status: "started" | "completed" | "abandoned";
  /** Orden efectivo que corrió este participante (fijado al iniciar). */
  runOrder: readonly string[];
  deviceType: string;
  excluded: boolean;
  startedAt: string;
  completedAt: string | null;
  lastActivityAt?: string;
  inactiveSince?: string | null;
  abandonReason?: string | null;
}

export interface SummaryChild {
  batterySessionId: string;
  studyId: string;
  status: string;
}

export interface ParticipantSummary {
  id: string;
  participantRef: string;
  status: ParticipationStatus;
  abandonReason?: string | null;
  deviceType: string;
  excluded: boolean;
  startedAt: string;
  completedAt: string | null;
  /** Estado de cada paso, en el orden que corrió ese participante. */
  steps: { studyId: string; status: StepStatus }[];
  /** Todos los pasos completados (aunque la sesión de batería aún no se haya cerrado). */
  allStepsDone: boolean;
}

export interface BatterySummary {
  total: number;
  completed: number;
  inProgress: number;
  inactive: number;
  abandoned: number;
  excluded: number;
  /** Por paso de la batería: cuántos participantes lo completaron o lo tienen en curso. */
  byStep: { studyId: string; completed: number; inProgress: number }[];
  /** De la más reciente a la más antigua. */
  participants: ParticipantSummary[];
}

export function summarizeBattery(
  stepOrder: readonly string[],
  sessions: readonly SummarySession[],
  children: readonly SummaryChild[],
): BatterySummary {
  const participants: ParticipantSummary[] = sessions
    .map((s) => {
      const mine = children.filter((c) => c.batterySessionId === s.id);
      const steps = stepProgress(
        s.runOrder,
        mine.map((c) => ({ studyId: c.studyId, status: c.status })),
      );
      return {
        id: s.id,
        participantRef: s.participantRef,
        status: participationStatus({ status: s.status, started_at: s.startedAt, last_activity_at: s.lastActivityAt, inactive_since: s.inactiveSince }),
        abandonReason: s.abandonReason,
        deviceType: s.deviceType,
        excluded: s.excluded,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        steps,
        allStepsDone: isBatteryComplete(steps),
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return {
    total: participants.length,
    completed: participants.filter((p) => p.status === "completed").length,
    inProgress: participants.filter((p) => p.status === "started").length,
    inactive: participants.filter((p) => p.status === "inactive").length,
    abandoned: participants.filter((p) => p.status === "abandoned").length,
    excluded: participants.filter((p) => p.excluded).length,
    byStep: stepOrder.map((studyId) => ({
      studyId,
      completed: participants.filter((p) =>
        p.steps.some((x) => x.studyId === studyId && x.status === "completed"),
      ).length,
      inProgress: participants.filter(
        (p) =>
          p.status === "started" &&
          p.steps.some(
            (x) => x.studyId === studyId && x.status === "in_progress",
          ),
      ).length,
    })),
    participants,
  };
}
