import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Resultado que devolverá la consulta falsa a `studies` y los filtros con que se la llamó. */
const db = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  queries: [] as { column: string; value: unknown }[],
  calls: 0,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    db.calls++;
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        db.queries.push({ column, value });
        return chain;
      },
      in: (column: string, value: unknown) => {
        db.queries.push({ column, value });
        return chain;
      },
      maybeSingle: async () => db.result,
    };
    return { from: () => chain };
  },
}));

import { demoConfig } from "@/tools/iat/demo";
import { generateMagicToken } from "@/lib/magic-link";
import type { SurveyConfig } from "@/tools/survey/engine";
import { validVariantConfig } from "@/tools/variants/defaults";
import {
  apiMessage,
  availabilityError,
  loadBatteryByToken,
  loadParticipantStudyByToken,
  loadStudyByToken,
  loadSurveyByToken,
  loadVariantByToken,
} from "./participant-api";

const surveyConfig: SurveyConfig = {
  version: 1,
  title: "Encuesta",
  texts: { consent: "Consentimiento", thankYou: "Gracias" },
  blocks: [
    { kind: "instrument", id: "nps", instrumentId: "nps", required: true },
  ],
};

function row(
  tool_type: "iat" | "survey" | "iat_variant",
  config: unknown,
  extra: Record<string, unknown> = {},
) {
  return {
    id: "study-1",
    tool_type,
    status: "published",
    closes_at: null,
    duplicate_policy: "device_cookie",
    config,
    ...extra,
  };
}

beforeEach(() => {
  db.result = { data: null, error: null };
  db.queries = [];
  db.calls = 0;
});

describe("carga del estudio del participante", () => {
  it("una liga con forma inválida se rechaza sin consultar la base de datos", async () => {
    expect(await loadStudyByToken("corto")).toEqual({
      ok: false,
      code: "invalid_link",
    });
    expect(await loadSurveyByToken("../../etc/passwd")).toEqual({
      ok: false,
      code: "invalid_link",
    });
    expect(await loadParticipantStudyByToken("")).toEqual({
      ok: false,
      code: "invalid_link",
    });
    expect(db.calls).toBe(0);
  });

  it("IAT: sólo pide estudios de tipo iat (un token de encuesta no abre el IAT)", async () => {
    await loadStudyByToken(generateMagicToken());
    expect(db.queries.find((q) => q.column === "tool_type")?.value).toEqual([
      "iat",
    ]);
  });

  it("encuesta: sólo pide estudios de tipo survey", async () => {
    await loadSurveyByToken(generateMagicToken());
    expect(db.queries.find((q) => q.column === "tool_type")?.value).toEqual([
      "survey",
    ]);
  });

  it("sin coincidencia → liga inválida; error de la base → error de servidor", async () => {
    const token = generateMagicToken();
    expect(await loadStudyByToken(token)).toEqual({
      ok: false,
      code: "invalid_link",
    });
    db.result = { data: null, error: { message: "boom" } };
    expect(await loadStudyByToken(token)).toEqual({
      ok: false,
      code: "server_error",
    });
  });

  it("IAT válido: devuelve la configuración validada y los datos de disponibilidad", async () => {
    db.result = {
      data: row("iat", demoConfig(), { closes_at: "2030-01-01T00:00:00Z" }),
      error: null,
    };
    const res = await loadStudyByToken(generateMagicToken());
    expect(res.ok && res.study).toMatchObject({
      id: "study-1",
      status: "published",
      closes_at: "2030-01-01T00:00:00Z",
    });
    expect(res.ok && res.study.config.dimensions.length).toBeGreaterThan(0);
  });

  it("configuración guardada inválida → error de servidor, no datos a medias", async () => {
    db.result = { data: row("iat", { version: 1 }), error: null };
    expect(await loadStudyByToken(generateMagicToken())).toEqual({
      ok: false,
      code: "server_error",
    });
    db.result = {
      data: row("survey", { version: 1, title: "x", blocks: [] }),
      error: null,
    };
    expect(await loadSurveyByToken(generateMagicToken())).toEqual({
      ok: false,
      code: "server_error",
    });
  });

  it("encuesta válida: devuelve su configuración", async () => {
    db.result = { data: row("survey", surveyConfig), error: null };
    const res = await loadSurveyByToken(generateMagicToken());
    expect(res.ok && res.study.config.title).toBe("Encuesta");
  });

  it("el cargador genérico distingue la herramienta del estudio", async () => {
    const token = generateMagicToken();
    db.result = { data: row("survey", surveyConfig), error: null };
    const survey = await loadParticipantStudyByToken(token);
    expect(survey.ok && survey.tool).toBe("survey");

    db.result = { data: row("iat", demoConfig()), error: null };
    const iat = await loadParticipantStudyByToken(token);
    expect(iat.ok && iat.tool).toBe("iat");
    expect(
      db.queries
        .filter((q) => q.column === "tool_type")
        .every((q) => (q.value as string[]).join() === "iat,survey,iat_variant"),
    ).toBe(true);
  });

  it("variante del IAT: sólo pide estudios de tipo iat_variant y valida su configuración", async () => {
    const token = generateMagicToken();
    await loadVariantByToken(token);
    expect(db.queries.find((q) => q.column === "tool_type")?.value).toEqual(["iat_variant"]);

    db.result = { data: row("iat_variant", validVariantConfig("gnat")), error: null };
    const ok = await loadVariantByToken(token);
    expect(ok.ok && ok.study.config.variant).toBe("gnat");

    db.result = { data: row("iat_variant", { version: 1 }), error: null };
    expect(await loadVariantByToken(token)).toEqual({ ok: false, code: "server_error" });
  });

  it("el cargador genérico entrega las variantes con su herramienta", async () => {
    db.result = { data: row("iat_variant", validVariantConfig("priming")), error: null };
    const res = await loadParticipantStudyByToken(generateMagicToken());
    expect(res.ok && res.tool).toBe("iat_variant");
  });
});

describe("disponibilidad", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  it("borrador y cerrado no aceptan participantes", () => {
    expect(availabilityError({ status: "draft", closes_at: null }, now)).toBe(
      "not_available",
    );
    expect(availabilityError({ status: "closed", closes_at: null }, now)).toBe(
      "closed",
    );
  });

  it("publicado: abierto hasta la fecha de cierre", () => {
    expect(
      availabilityError({ status: "published", closes_at: null }, now),
    ).toBeNull();
    expect(
      availabilityError(
        { status: "published", closes_at: "2026-10-15T00:00:00Z" },
        now,
      ),
    ).toBeNull();
    expect(
      availabilityError(
        { status: "published", closes_at: "2026-10-14T12:00:00Z" },
        now,
      ),
    ).toBe("closed");
    expect(
      availabilityError(
        { status: "published", closes_at: "2026-10-01T00:00:00Z" },
        now,
      ),
    ).toBe("closed");
  });
});

describe("carga de la batería", () => {
  const batteryRow = (
    config: unknown,
    extra: Record<string, unknown> = {},
  ) => ({
    id: "bat-1",
    status: "published",
    closes_at: null,
    duplicate_policy: "device_cookie",
    config,
    ...extra,
  });
  const validConfig = {
    version: 1,
    title: "Estudio",
    texts: { consent: "Consentimiento", thankYou: "Gracias" },
  };

  it("rechaza ligas con forma inválida sin consultar la base de datos", async () => {
    expect(await loadBatteryByToken("corto")).toEqual({
      ok: false,
      code: "invalid_link",
    });
    expect(db.calls).toBe(0);
  });

  it("sin coincidencia → liga inválida; error de la base → error de servidor", async () => {
    const token = generateMagicToken();
    expect(await loadBatteryByToken(token)).toEqual({
      ok: false,
      code: "invalid_link",
    });
    db.result = { data: null, error: { message: "boom" } };
    expect(await loadBatteryByToken(token)).toEqual({
      ok: false,
      code: "server_error",
    });
  });

  it("devuelve la batería con su configuración validada", async () => {
    db.result = {
      data: batteryRow(validConfig, { closes_at: "2030-01-01T00:00:00Z" }),
      error: null,
    };
    const res = await loadBatteryByToken(generateMagicToken());
    expect(res.ok && res.study).toMatchObject({
      id: "bat-1",
      status: "published",
      closes_at: "2030-01-01T00:00:00Z",
    });
    expect(res.ok && res.study.config.title).toBe("Estudio");
  });

  it("una configuración guardada inválida → error de servidor", async () => {
    db.result = { data: batteryRow({ version: 1 }), error: null };
    expect(await loadBatteryByToken(generateMagicToken())).toEqual({
      ok: false,
      code: "server_error",
    });
  });

  it("el código de paso fuera de orden tiene mensaje en español", () => {
    expect(apiMessage("out_of_order")).toMatch(/termina primero el anterior/);
  });
});
