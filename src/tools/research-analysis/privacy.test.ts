import { describe, expect, it } from "vitest";
import { batteryAiAggregates } from "./privacy";
import { buildBatteryReport } from "@/tools/battery/report/report";
import {
  computeSurveyAggregates,
  type SurveyConfig,
} from "@/tools/survey/engine";
import { researchContextSchema } from "./schema";
import { snapshotKey } from "./snapshot";

describe("research analysis privacy and snapshots", () => {
  it("omits participant rows and IDs from the battery AI payload", () => {
    const report = buildBatteryReport(
      [],
      [
        {
          id: "private-session-id",
          ref: "private-code",
          excluded: false,
          iat: {},
          survey: {},
        },
      ],
    );
    const payload = JSON.stringify(batteryAiAggregates(report));
    expect(payload).not.toContain("private-session-id");
    expect(payload).not.toContain("private-code");
    expect(payload).not.toContain('"rows"');
    expect(batteryAiAggregates(report).nIncluded).toBe(1);
  });
  it("keeps free text out of survey aggregates", () => {
    const config: SurveyConfig = {
      version: 1,
      title: "Test",
      texts: { consent: "Consent", thankYou: "Gracias" },
      blocks: [
        {
          kind: "questions",
          id: "b",
          questions: [
            { type: "text", id: "q", prompt: "Opinión", required: true },
          ],
        },
      ],
    };
    const aggregates = computeSurveyAggregates(config, [
      { id: "private-id", answers: { q: "private free text" } },
    ]);
    expect(JSON.stringify(aggregates)).not.toContain("private");
    expect(aggregates.items[0]).toMatchObject({ type: "text", n: 1 });
  });
  it("requires material and both objectives before AI", () => {
    expect(
      researchContextSchema.safeParse({
        material: " ",
        materialObjective: "Objetivo",
        brandObjective: "Objetivo",
      }).success,
    ).toBe(false);
    expect(
      researchContextSchema.safeParse({
        material: "Anuncio",
        materialObjective: " ",
        brandObjective: "Objetivo",
      }).success,
    ).toBe(false);
    expect(
      researchContextSchema.safeParse({
        material: "Anuncio",
        materialObjective: "Objetivo",
        brandObjective: " ",
      }).success,
    ).toBe(false);
  });
  it("ignores JSONB key order but detects same-size aggregate changes", () => {
    expect(snapshotKey({ n: 3, data: { a: 1, b: 2 } })).toBe(
      snapshotKey({ data: { b: 2, a: 1 }, n: 3 }),
    );
    expect(snapshotKey({ n: 3, mean: 2 })).not.toBe(
      snapshotKey({ n: 3, mean: 3 }),
    );
    expect(JSON.parse(snapshotKey({ a: 1 }))).toEqual({ a: 1 });
  });
});
