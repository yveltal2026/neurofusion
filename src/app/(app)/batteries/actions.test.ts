import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoConfig } from "@/tools/iat/demo";
import { DEFAULT_THANK_YOU, defaultConsentText } from "@/tools/survey/engine";
import { defaultBatteryConsent, DEFAULT_BATTERY_THANK_YOU } from "@/tools/battery/engine/config";

const P = "10000000-0000-4000-8000-000000000001";
const ID = (n: number) => `20000000-0000-4000-8000-00000000000${n}`;
const survey = {
  version: 1,
  title: "E",
  texts: { consent: defaultConsentText("E"), thankYou: DEFAULT_THANK_YOU },
  blocks: [{ kind: "instrument", id: "nps", instrumentId: "nps", required: true }],
};

const mocks = vi.hoisted(() => ({
  studies: [] as Record<string, unknown>[],
  batteryInsert: null as Record<string, unknown> | null,
  batteryResult: { data: { id: "bat-1" } as { id: string } | null, error: null as unknown },
  stepsInsert: null as Record<string, unknown>[] | null,
  stepsError: null as unknown,
  deletedBatteries: [] as string[],
  redirected: null as string | null,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mocks.redirected = url;
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({
    supabase: {
      from: (table: string) => {
        if (table === "studies") {
          return { select: () => ({ in: () => ({ returns: async () => ({ data: mocks.studies }) }) }) };
        }
        if (table === "batteries") {
          return {
            insert: (row: Record<string, unknown>) => {
              mocks.batteryInsert = row;
              return { select: () => ({ single: async () => mocks.batteryResult }) };
            },
            delete: () => ({
              eq: async (_c: string, id: string) => {
                mocks.deletedBatteries.push(id);
                return { error: null };
              },
            }),
          };
        }
        return {
          insert: async (rows: Record<string, unknown>[]) => {
            mocks.stepsInsert = rows;
            return { error: mocks.stepsError };
          },
        };
      },
    },
  }),
}));

import { createBattery } from "./actions";

const texts = { consent: defaultBatteryConsent("Mi estudio"), thankYou: DEFAULT_BATTERY_THANK_YOU };
const input = (steps = [{ studyId: ID(1), enabled: true }, { studyId: ID(2), enabled: true }]) => ({ projectId: P, name: "  Mi batería  ", steps, texts });

beforeEach(() => {
  mocks.studies = [
    { id: ID(1), project_id: P, tool_type: "iat", name: "IAT", status: "published", config: demoConfig() },
    { id: ID(2), project_id: P, tool_type: "survey", name: "Encuesta", status: "published", config: survey },
  ];
  mocks.batteryInsert = null;
  mocks.batteryResult = { data: { id: "bat-1" }, error: null };
  mocks.stepsInsert = null;
  mocks.stepsError = null;
  mocks.deletedBatteries = [];
  mocks.redirected = null;
});

describe("createBattery", () => {
  it("crea la batería publicada con liga y pasos ordenados, y redirige a su resumen", async () => {
    await expect(createBattery(input())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirected).toBe("/batteries/bat-1?created=1");
    expect(mocks.batteryInsert).toMatchObject({ project_id: P, name: "Mi batería", status: "published", config: { version: 1, texts } });
    expect(mocks.batteryInsert!.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mocks.stepsInsert).toEqual([
      { battery_id: "bat-1", position: 0, study_id: ID(1), enabled: true },
      { battery_id: "bat-1", position: 1, study_id: ID(2), enabled: true },
    ]);
  });

  it("queda en borrador si un paso activo no está publicado", async () => {
    mocks.studies[1]!.status = "draft";
    await expect(createBattery(input())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.batteryInsert).toMatchObject({ status: "draft" });
  });

  it("devuelve el error de validación sin tocar la base", async () => {
    expect(await createBattery(input([]))).toEqual({ error: expect.stringMatching(/al menos un estudio/) });
    expect(await createBattery({ ...input(), name: "" })).toEqual({ error: expect.stringMatching(/nombre/) });
    expect(mocks.batteryInsert).toBeNull();
  });

  it("rechaza estudios inexistentes o de otra organización (RLS no los devuelve)", async () => {
    mocks.studies = [mocks.studies[0]!];
    expect(await createBattery(input())).toMatchObject({ error: expect.any(String) });
    expect(mocks.batteryInsert).toBeNull();
  });

  it("rechaza estudios de otro proyecto", async () => {
    mocks.studies[1]!.project_id = "otro";
    expect(await createBattery(input())).toEqual({ error: expect.stringMatching(/mismo proyecto/) });
  });

  it("si la base rechaza la batería (RLS), lo dice", async () => {
    mocks.batteryResult = { data: null, error: { message: "rls" } };
    expect(await createBattery(input())).toEqual({ error: expect.stringMatching(/No se pudo crear/) });
  });

  it("si fallan los pasos, borra la batería para no dejarla vacía", async () => {
    mocks.stepsError = { message: "x" };
    expect(await createBattery(input())).toEqual({ error: expect.stringMatching(/pasos/) });
    expect(mocks.deletedBatteries).toEqual(["bat-1"]);
    expect(mocks.redirected).toBeNull();
  });
});
