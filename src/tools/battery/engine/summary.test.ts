import { describe, expect, it } from "vitest";
import {
  summarizeBattery,
  type SummaryChild,
  type SummarySession,
} from "./summary";

const session = (
  id: string,
  status: SummarySession["status"],
  extra: Partial<SummarySession> = {},
): SummarySession => ({
  id,
  participantRef: `ref-${id}`,
  status,
  runOrder: ["a", "b"],
  deviceType: "mobile",
  excluded: false,
  startedAt: `2026-10-14T10:0${id.length}:00Z`,
  completedAt: status === "completed" ? "2026-10-14T11:00:00Z" : null,
  ...extra,
});
const child = (
  batterySessionId: string,
  studyId: string,
  status: string,
): SummaryChild => ({ batterySessionId, studyId, status });

describe("resumen de la batería", () => {
  const sessions = [
    session("s1", "completed", { startedAt: "2026-10-14T10:00:00Z" }),
    session("s2", "started", { startedAt: "2026-10-14T10:05:00Z" }),
    session("s3", "started", { startedAt: "2026-10-14T10:10:00Z" }),
    session("s4", "abandoned", {
      startedAt: "2026-10-14T10:15:00Z",
      excluded: true,
    }),
  ];
  const children = [
    child("s1", "a", "completed"),
    child("s1", "b", "completed"),
    child("s2", "a", "completed"),
    child("s2", "b", "started"),
    child("s3", "a", "started"),
    child("s4", "a", "abandoned"),
  ];
  const summary = summarizeBattery(["a", "b"], sessions, children);

  it("cuenta participantes por estado y los excluidos", () => {
    expect(summary).toMatchObject({
      total: 4,
      completed: 1,
      inProgress: 2,
      abandoned: 1,
      excluded: 1,
    });
  });

  it("cuenta cuántos completaron o tienen en curso cada paso", () => {
    expect(summary.byStep).toEqual([
      { studyId: "a", completed: 2, inProgress: 1 },
      { studyId: "b", completed: 1, inProgress: 1 },
    ]);
  });

  it("deriva el estado de cada paso de cada participante, del más reciente al más antiguo", () => {
    expect(summary.participants.map((p) => p.id)).toEqual([
      "s4",
      "s3",
      "s2",
      "s1",
    ]);
    const s2 = summary.participants.find((p) => p.id === "s2")!;
    expect(s2.steps).toEqual([
      { studyId: "a", status: "completed" },
      { studyId: "b", status: "in_progress" },
    ]);
    expect(s2.allStepsDone).toBe(false);
    expect(summary.participants.find((p) => p.id === "s1")!.allStepsDone).toBe(
      true,
    );
  });

  it("una sesión abandonada no cuenta sus pasos como en curso", () => {
    const s4 = summary.participants.find((p) => p.id === "s4")!;
    expect(s4.steps.every((x) => x.status !== "in_progress")).toBe(true);
    expect(summary.byStep[0]!.inProgress).toBe(1); // sólo s3
  });

  it("usa el orden efectivo de cada participante, no el actual de la batería", () => {
    const s = summarizeBattery(
      ["a", "b"],
      [session("s9", "started", { runOrder: ["b", "a"] })],
      [child("s9", "b", "completed")],
    );
    expect(s.participants[0]!.steps).toEqual([
      { studyId: "b", status: "completed" },
      { studyId: "a", status: "pending" },
    ]);
  });

  it("sin participantes devuelve ceros y los pasos con cero", () => {
    expect(summarizeBattery(["a"], [], [])).toEqual({
      total: 0,
      completed: 0,
      inProgress: 0,
      abandoned: 0,
      excluded: 0,
      byStep: [{ studyId: "a", completed: 0, inProgress: 0 }],
      participants: [],
    });
  });
});
