import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  source: { name: "Café", tool_type: "iat", config: { product: "café" }, duplicate_policy: "device_cookie" } as Record<string, unknown> | null,
  inserted: null as Record<string, unknown> | null,
  insertResult: { data: { id: "copy-1" } as { id: string } | null, error: null as unknown },
  redirected: null as string | null,
  toolFilter: null as unknown,
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
      from: () => ({
        select: () => ({
          eq: () => ({
            in: (_col: string, tools: unknown) => {
              mocks.toolFilter = tools;
              return { maybeSingle: async () => ({ data: mocks.source }) };
            },
          }),
        }),
        insert: (row: Record<string, unknown>) => {
          mocks.inserted = row;
          return { select: () => ({ single: async () => mocks.insertResult }) };
        },
      }),
    },
  }),
}));

import { duplicateStudy } from "./actions";

const ID = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";

function form(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  mocks.source = { name: "Café", tool_type: "iat", config: { product: "café" }, duplicate_policy: "device_cookie" };
  mocks.inserted = null;
  mocks.redirected = null;
  mocks.insertResult = { data: { id: "copy-1" }, error: null };
});

describe("duplicateStudy", () => {
  it("copia la configuración en borrador con liga nueva y redirige a la copia", async () => {
    await expect(duplicateStudy(form({ id: ID, projectId: PROJECT }))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirected).toBe("/studies/copy-1?copied=1");
    expect(mocks.inserted).toMatchObject({
      project_id: PROJECT,
      tool_type: "iat",
      name: "Café (copia)",
      status: "draft",
      config: { product: "café" },
      duplicate_policy: "device_cookie",
    });
    expect(mocks.inserted!.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mocks.inserted).not.toHaveProperty("max_responses");
  });

  it("sólo copia IAT, encuesta y variantes del IAT", async () => {
    await duplicateStudy(form({ id: ID, projectId: PROJECT })).catch(() => {});
    expect(mocks.toolFilter).toEqual(["iat", "survey", "iat_variant"]);
  });

  it("usa el nombre indicado y lo recorta a 160 caracteres", async () => {
    await expect(duplicateStudy(form({ id: ID, projectId: PROJECT, name: "Equipo 3" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.inserted!.name).toBe("Equipo 3");
  });

  it("no hace nada si el estudio no existe o no es copiable", async () => {
    mocks.source = null;
    await duplicateStudy(form({ id: ID, projectId: PROJECT }));
    expect(mocks.inserted).toBeNull();
    expect(mocks.redirected).toBeNull();
  });

  it("no redirige si la base rechaza el insert (RLS)", async () => {
    mocks.insertResult = { data: null, error: { message: "rls" } };
    await duplicateStudy(form({ id: ID, projectId: PROJECT }));
    expect(mocks.redirected).toBeNull();
  });

  it("ignora ids que no son uuid", async () => {
    await duplicateStudy(form({ id: "no-uuid", projectId: PROJECT }));
    expect(mocks.inserted).toBeNull();
  });
});
