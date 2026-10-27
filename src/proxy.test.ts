import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => false }));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: async () => new Response() }));

import { config } from "./proxy";

// El matcher de Next usa sintaxis path-to-regexp; para este patrón basta anclarlo como expresión regular.
const matcher = new RegExp(`^${config.matcher[0]}$`);
const covered = (path: string) => matcher.test(path);

describe("matcher del proxy", () => {
  it("deja fuera las rutas públicas del participante (IAT/encuesta y batería)", () => {
    for (const p of ["/s/abc", "/api/s/abc/start", "/b/abc", "/api/b/abc/start", "/api/b/abc/progress", "/lab/eyetracking", "/web/model.json", "/web/group1-shard1of1.bin"]) {
      expect(covered(p), p).toBe(false);
    }
  });

  it("protege las rutas del investigador", () => {
    for (const p of ["/projects", "/studies/1", "/batteries/1", "/batteries/1/results", "/muestra", "/projects/1/batteries/new"]) {
      expect(covered(p), p).toBe(true);
    }
  });

  it("no confunde rutas que sólo empiezan con la misma letra", () => {
    expect(covered("/batteries/x")).toBe(true);
    expect(covered("/studies/x")).toBe(true);
  });
});
