import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = {
  table: string;
  op: string;
  payload?: unknown;
  filters: [string, unknown][];
};

const mocks = vi.hoisted(() => ({
  calls: [] as {
    table: string;
    op: string;
    payload?: unknown;
    filters: [string, unknown][];
  }[],
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  rpcError: null as null | { code?: string; message: string },
  insertResult: {
    data: { id: "bat-1" } as { id: string } | null,
    error: null as unknown,
  },
  selectOne: null as unknown,
  selectMany: [] as unknown[],
  count: 1 as number | null,
  updateResult: {
    data: [{ id: "bat-1" }] as unknown[] | null,
    error: null as unknown,
  },
  redirected: null as string | null,
  revalidated: [] as string[],
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mocks.redirected = url;
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: (p: string) => mocks.revalidated.push(p),
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({
    supabase: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        mocks.rpcCalls.push({ name, args });
        return { data: null, error: mocks.rpcError };
      },
      from: (table: string) => {
        const call: Call = { table, op: "select", filters: [] };
        mocks.calls.push(call);
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.insert = (payload: unknown) => (
          (call.op = "insert"),
          (call.payload = payload),
          chain
        );
        chain.update = (payload: unknown) => (
          (call.op = "update"),
          (call.payload = payload),
          chain
        );
        chain.delete = () => ((call.op = "delete"), chain);
        chain.eq = (c: string, v: unknown) => (
          call.filters.push([c, v]),
          chain
        );
        chain.order = () => chain;
        chain.single = async () =>
          call.op === "insert"
            ? mocks.insertResult
            : { data: mocks.selectOne, error: null };
        chain.maybeSingle = async () => ({
          data: mocks.selectOne,
          error: null,
        });
        chain.then = (res: (v: unknown) => unknown) =>
          Promise.resolve(
            call.op === "update"
              ? mocks.updateResult
              : call.op === "select"
                ? { data: mocks.selectMany, count: mocks.count, error: null }
                : { data: null, error: null },
          ).then(res);
        return chain;
      },
    },
  }),
}));

import {
  createBattery,
  deleteBattery,
  duplicateBattery,
  regenerateBatteryLink,
  saveBatterySteps,
  updateBatterySettings,
} from "./actions";
import { DEFAULT_BATTERY_THANK_YOU, defaultBatteryConsentText } from "./engine";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const S1 = "21111111-1111-4111-8111-111111111111";
const S2 = "22222222-1111-4111-8111-111111111111";
const BAT = "33333333-1111-4111-8111-111111111111";
const config = {
  version: 1,
  title: "Estudio",
  texts: {
    consent: defaultBatteryConsentText("Estudio"),
    thankYou: DEFAULT_BATTERY_THANK_YOU,
  },
};
const steps = [
  { studyId: S1, enabled: true },
  { studyId: S2, enabled: false },
];
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  mocks.calls = [];
  mocks.rpcCalls = [];
  mocks.rpcError = null;
  mocks.insertResult = { data: { id: "bat-1" }, error: null };
  mocks.selectOne = null;
  mocks.selectMany = [];
  mocks.count = 1;
  mocks.updateResult = { data: [{ id: "bat-1" }], error: null };
  mocks.redirected = null;
  mocks.revalidated = [];
});

describe("createBattery", () => {
  it("crea la batería publicada con liga, guarda los pasos en orden y redirige", async () => {
    await expect(
      createBattery({
        projectId: PROJECT,
        name: "  Mi batería  ",
        config,
        steps,
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    const insert = mocks.calls.find((c) => c.op === "insert")!;
    expect(insert.table).toBe("batteries");
    expect(insert.payload).toMatchObject({
      project_id: PROJECT,
      name: "Mi batería",
      status: "published",
    });
    expect((insert.payload as { access_token: string }).access_token).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
    expect(mocks.rpcCalls).toEqual([
      {
        name: "save_battery_steps",
        args: {
          p_battery: "bat-1",
          p_steps: [
            { study_id: S1, enabled: true },
            { study_id: S2, enabled: false },
          ],
        },
      },
    ]);
    expect(mocks.redirected).toBe("/batteries/bat-1?created=1");
  });

  it("rechaza entradas inválidas sin tocar la base de datos", async () => {
    const bad: unknown[] = [
      null,
      "hola",
      { projectId: "no-uuid", name: "x", config, steps },
      { projectId: PROJECT, name: "   ", config, steps },
      {
        projectId: PROJECT,
        name: "x",
        config: { ...config, title: "" },
        steps,
      },
      {
        projectId: PROJECT,
        name: "x",
        config,
        steps: [{ studyId: "no-uuid", enabled: true }],
      },
    ];
    for (const raw of bad)
      expect((await createBattery(raw)).error).toBeTruthy();
    expect(mocks.calls).toHaveLength(0);
  });

  it("exige al menos un paso, uno activo y sin repetir estudios", async () => {
    expect(
      (
        await createBattery({
          projectId: PROJECT,
          name: "x",
          config,
          steps: [],
        })
      ).error,
    ).toBe("Agrega al menos un paso.");
    expect(
      (
        await createBattery({
          projectId: PROJECT,
          name: "x",
          config,
          steps: [{ studyId: S1, enabled: false }],
        })
      ).error,
    ).toBe("Deja al menos un paso activo.");
    expect(
      (
        await createBattery({
          projectId: PROJECT,
          name: "x",
          config,
          steps: [steps[0], steps[0]],
        })
      ).error,
    ).toBe("Un mismo estudio no puede aparecer dos veces.");
    expect(mocks.calls).toHaveLength(0);
  });

  it("no acepta que el cliente fije el estado ni el token", async () => {
    await expect(
      createBattery({
        projectId: PROJECT,
        name: "x",
        config,
        steps,
        status: "closed",
        access_token: "robado",
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    const payload = mocks.calls.find((c) => c.op === "insert")!
      .payload as Record<string, unknown>;
    expect(payload.status).toBe("published");
    expect(payload.access_token).not.toBe("robado");
  });

  it("si la base rechaza el alta (RLS / proyecto ajeno) devuelve error y no redirige", async () => {
    mocks.insertResult = { data: null, error: { message: "rls" } };
    expect(
      (await createBattery({ projectId: PROJECT, name: "x", config, steps }))
        .error,
    ).toContain("No se pudo crear la batería");
    expect(mocks.redirected).toBeNull();
    expect(mocks.rpcCalls).toHaveLength(0);
  });

  it("si los pasos no se pueden guardar, borra la batería y muestra el motivo", async () => {
    mocks.rpcError = {
      code: "23514",
      message:
        "Sólo los estudios IAT y encuesta pueden ser pasos de una batería",
    };
    const res = await createBattery({
      projectId: PROJECT,
      name: "x",
      config,
      steps,
    });
    expect(res.error).toBe(
      "Sólo los estudios IAT y encuesta pueden ser pasos de una batería",
    );
    expect(
      mocks.calls.some(
        (c) =>
          c.table === "batteries" &&
          c.op === "delete" &&
          c.filters.some(([, v]) => v === "bat-1"),
      ),
    ).toBe(true);
    expect(mocks.redirected).toBeNull();
  });

  it("un error inesperado de la base no filtra su mensaje técnico", async () => {
    mocks.rpcError = {
      code: "XX000",
      message: 'relation "internal_table" exploded',
    };
    const res = await createBattery({
      projectId: PROJECT,
      name: "x",
      config,
      steps,
    });
    expect(res.error).not.toContain("internal_table");
  });
});

describe("saveBatterySteps", () => {
  it("guarda el orden y los pasos activos y refresca la página", async () => {
    expect(await saveBatterySteps({ batteryId: BAT, steps })).toEqual({
      saved: true,
    });
    expect(mocks.rpcCalls[0]).toEqual({
      name: "save_battery_steps",
      args: {
        p_battery: BAT,
        p_steps: [
          { study_id: S1, enabled: true },
          { study_id: S2, enabled: false },
        ],
      },
    });
    expect(mocks.revalidated).toEqual([`/batteries/${BAT}`]);
  });

  it("muestra el motivo cuando la batería ya tiene respuestas", async () => {
    mocks.rpcError = {
      code: "23514",
      message:
        "La batería ya tiene respuestas: duplícala para cambiar sus pasos",
    };
    expect(await saveBatterySteps({ batteryId: BAT, steps })).toEqual({
      error: "La batería ya tiene respuestas: duplícala para cambiar sus pasos",
    });
    expect(mocks.revalidated).toEqual([]);
  });

  it("valida la composición antes de llamar a la base", async () => {
    expect((await saveBatterySteps({ batteryId: BAT, steps: [] })).error).toBe(
      "Agrega al menos un paso.",
    );
    expect(
      (await saveBatterySteps({ batteryId: "no-uuid", steps })).error,
    ).toBeTruthy();
    expect(mocks.rpcCalls).toHaveLength(0);
  });
});

describe("updateBatterySettings", () => {
  const fields = {
    id: BAT,
    status: "closed",
    duplicate_policy: "device_cookie",
    max_responses: "50",
    closes_at: "",
  };

  it("guarda los ajustes", async () => {
    expect(await updateBatterySettings({}, form(fields))).toEqual({
      saved: true,
    });
    const update = mocks.calls.find((c) => c.op === "update")!;
    expect(update.table).toBe("batteries");
    expect(update.payload).toEqual({
      status: "closed",
      duplicate_policy: "device_cookie",
      max_responses: 50,
      closes_at: null,
    });
  });

  it("no deja publicar una batería sin pasos activos", async () => {
    mocks.count = 0;
    expect(
      await updateBatterySettings({}, form({ ...fields, status: "published" })),
    ).toEqual({
      error: "Agrega al menos un paso activo antes de publicar la batería",
    });
    expect(mocks.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("publica si hay pasos activos", async () => {
    mocks.count = 2;
    expect(
      await updateBatterySettings({}, form({ ...fields, status: "published" })),
    ).toEqual({ saved: true });
  });

  it("valida el cupo, la fecha y los valores permitidos", async () => {
    expect(
      (await updateBatterySettings({}, form({ ...fields, max_responses: "0" })))
        .error,
    ).toBe("Debe ser mayor a 0");
    expect(
      (
        await updateBatterySettings(
          {},
          form({ ...fields, max_responses: "2.5" }),
        )
      ).error,
    ).toBe("Debe ser un número entero");
    expect(
      (
        await updateBatterySettings(
          {},
          form({ ...fields, closes_at: "mañana" }),
        )
      ).error,
    ).toBe("Fecha inválida");
    expect(
      (await updateBatterySettings({}, form({ ...fields, status: "secreto" })))
        .error,
    ).toBeTruthy();
    expect(
      (await updateBatterySettings({}, form({ ...fields, id: "no-uuid" })))
        .error,
    ).toBeTruthy();
  });

  it("si no se actualizó nada (batería ajena por RLS) lo informa", async () => {
    mocks.updateResult = { data: [], error: null };
    expect(await updateBatterySettings({}, form(fields))).toEqual({
      error: "No se pudieron guardar los cambios",
    });
  });
});

describe("liga, borrado y copia", () => {
  it("regenerar la liga fija un token nuevo", async () => {
    await regenerateBatteryLink(form({ id: BAT }));
    const update = mocks.calls.find((c) => c.op === "update")!;
    expect((update.payload as { access_token: string }).access_token).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
    expect(update.filters).toEqual([["id", BAT]]);
    await regenerateBatteryLink(form({ id: "no-uuid" }));
    expect(mocks.calls.filter((c) => c.op === "update")).toHaveLength(1);
  });

  it("borrar elimina la batería y vuelve al proyecto", async () => {
    mocks.selectOne = { project_id: PROJECT };
    await expect(deleteBattery(form({ id: BAT }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(
      mocks.calls.some((c) => c.op === "delete" && c.table === "batteries"),
    ).toBe(true);
    expect(mocks.redirected).toBe(`/projects/${PROJECT}`);
  });

  it("duplicar crea un borrador con los mismos pasos, sin participantes ni fecha de cierre", async () => {
    mocks.selectOne = {
      project_id: PROJECT,
      name: "Original",
      config,
      max_responses: 10,
      closes_at: "2030-01-01T00:00:00Z",
      duplicate_policy: "none",
    };
    mocks.selectMany = [
      { study_id: S1, enabled: true, position: 0 },
      { study_id: S2, enabled: false, position: 1 },
    ];
    mocks.insertResult = { data: { id: "copia-1" }, error: null };
    await expect(duplicateBattery(form({ id: BAT }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    const insert = mocks.calls.find((c) => c.op === "insert")!;
    expect(insert.payload).toMatchObject({
      project_id: PROJECT,
      name: "Original (copia)",
      status: "draft",
      closes_at: null,
      max_responses: 10,
      duplicate_policy: "none",
    });
    expect((insert.payload as { access_token: string }).access_token).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
    expect(mocks.rpcCalls[0]).toEqual({
      name: "save_battery_steps",
      args: {
        p_battery: "copia-1",
        p_steps: [
          { study_id: S1, enabled: true },
          { study_id: S2, enabled: false },
        ],
      },
    });
    expect(mocks.redirected).toBe("/batteries/copia-1?duplicated=1");
  });

  it("si la copia no puede guardar los pasos, la borra y no redirige", async () => {
    mocks.selectOne = {
      project_id: PROJECT,
      name: "Original",
      config,
      max_responses: null,
      closes_at: null,
      duplicate_policy: "device_cookie",
    };
    mocks.insertResult = { data: { id: "copia-1" }, error: null };
    mocks.rpcError = { message: "boom" };
    await duplicateBattery(form({ id: BAT }));
    expect(mocks.redirected).toBeNull();
    expect(
      mocks.calls.some(
        (c) => c.op === "delete" && c.filters.some(([, v]) => v === "copia-1"),
      ),
    ).toBe(true);
  });
});
