import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inBattery: [] as unknown[],
  study: { project_id: "proj-1", tool_type: "iat" } as Record<string, unknown> | null,
  deleted: [] as string[],
  redirected: null as string | null,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mocks.redirected = url;
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/study-files", () => ({ removeStudyFiles: async () => {} }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({
    supabase: {
      from: (table: string) => {
        if (table === "battery_steps") return { select: () => ({ eq: () => ({ limit: async () => ({ data: mocks.inBattery }) }) }) };
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.study }) }) }),
          delete: () => ({
            eq: async (_c: string, id: string) => {
              mocks.deleted.push(id);
              return { error: null };
            },
          }),
        };
      },
    },
  }),
}));

import { deleteStudy } from "./actions";

const ID = "11111111-1111-4111-8111-111111111111";
const form = (id: string) => {
  const f = new FormData();
  f.set("id", id);
  return f;
};

beforeEach(() => {
  mocks.inBattery = [];
  mocks.study = { project_id: "proj-1", tool_type: "iat" };
  mocks.deleted = [];
  mocks.redirected = null;
});

describe("deleteStudy", () => {
  it("borra el estudio y vuelve al proyecto", async () => {
    await expect(deleteStudy(form(ID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.deleted).toEqual([ID]);
    expect(mocks.redirected).toBe("/projects/proj-1");
  });

  it("no borra un estudio que es paso de una batería: vuelve a su página con el aviso", async () => {
    mocks.inBattery = [{ battery_id: "bat-1" }];
    await expect(deleteStudy(form(ID))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.deleted).toEqual([]);
    expect(mocks.redirected).toBe(`/studies/${ID}?inBattery=1`);
  });

  it("ignora ids inválidos", async () => {
    await deleteStudy(form("no-uuid"));
    expect(mocks.deleted).toEqual([]);
    expect(mocks.redirected).toBeNull();
  });
});
