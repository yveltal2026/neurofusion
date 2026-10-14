import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { linkOutcomeToCode, linkStepSession } from "./battery-link";

function fakeAdmin(rpc: { data: unknown; error: unknown }) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const updates: {
    patch: Record<string, unknown>;
    filters: [string, unknown][];
  }[] = [];
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return rpc;
    },
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        const u = { patch, filters: [] as [string, unknown][] };
        updates.push(u);
        const chain = {
          eq: (col: string, val: unknown) => {
            u.filters.push([col, val]);
            return chain;
          },
          then: (res: (v: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(res),
        };
        return chain;
      },
    }),
  };
  return { admin: admin as unknown as SupabaseClient, calls, updates };
}

describe("traducción de resultados de link_battery_step", () => {
  it.each([
    ["ok", null],
    ["out_of_order", "out_of_order"],
    ["battery_session_closed", "closed"],
    ["study_not_in_battery", "invalid_data"],
    ["already_linked", "invalid_data"],
    ["session_not_started", "invalid_data"],
    ["session_not_found", "not_found"],
    ["battery_session_not_found", "not_found"],
    ["algo_raro", "server_error"],
    [undefined, "server_error"],
    [null, "server_error"],
  ])("%s → %s", (outcome, code) => {
    expect(linkOutcomeToCode(outcome as string | null | undefined)).toBe(code);
  });
});

describe("linkStepSession", () => {
  it("enlaza con los parámetros correctos y no toca la sesión si todo sale bien", async () => {
    const f = fakeAdmin({ data: "ok", error: null });
    expect(await linkStepSession(f.admin, "sess-1", "bat-1")).toEqual({
      ok: true,
    });
    expect(f.calls).toEqual([
      {
        name: "link_battery_step",
        args: { p_session: "sess-1", p_battery_session: "bat-1" },
      },
    ]);
    expect(f.updates).toHaveLength(0);
  });

  it("si la base rechaza el vínculo, devuelve el código y abandona la sesión (no deja huérfanas)", async () => {
    const f = fakeAdmin({ data: "out_of_order", error: null });
    expect(await linkStepSession(f.admin, "sess-1", "bat-1")).toEqual({
      ok: false,
      code: "out_of_order",
    });
    expect(f.updates).toHaveLength(1);
    expect(f.updates[0]!.patch).toEqual({ status: "abandoned" });
    // Sólo abandona la sesión en curso de ESE id (no afecta a las completadas).
    expect(f.updates[0]!.filters).toEqual([
      ["id", "sess-1"],
      ["status", "started"],
    ]);
  });

  it("un error de la base también abandona la sesión y se reporta como error de servidor", async () => {
    const f = fakeAdmin({ data: null, error: { message: "boom" } });
    expect(await linkStepSession(f.admin, "sess-1", "bat-1")).toEqual({
      ok: false,
      code: "server_error",
    });
    expect(f.updates).toHaveLength(1);
  });
});
