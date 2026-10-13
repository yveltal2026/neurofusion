import { z } from "zod";
import type { SeoAuditRow } from "@/lib/db/types";
import type { AuditSummary, Finding, PageSummary, PerformanceResult } from "./engine";
import { seoAiResultSchema, type SeoAiResult } from "./analysis/schema";

/** Auditoría guardada, con tipos. Los jsonb los escribió el servidor con el motor. */
export interface SeoAudit {
  id: string;
  mode: "live" | "upload";
  siteUrl: string;
  engineVersion: string;
  summary: AuditSummary;
  pages: PageSummary[];
  findings: Finding[];
  performance: PerformanceResult | null;
  notes: string[];
  durationMs: number | null;
  ai: { result: SeoAiResult; provider: string | null; model: string | null; generatedAt: string | null } | null;
  createdAt: string;
}

const arr = z.array(z.unknown());

export function toSeoAudit(row: SeoAuditRow): SeoAudit {
  const ai = row.ai_result ? seoAiResultSchema.safeParse(row.ai_result) : null;
  return {
    id: row.id,
    mode: row.mode,
    siteUrl: row.site_url,
    engineVersion: row.engine_version,
    summary: row.summary as AuditSummary,
    pages: (arr.safeParse(row.pages).success ? row.pages : []) as PageSummary[],
    findings: (arr.safeParse(row.findings).success ? row.findings : []) as Finding[],
    performance: (row.performance ?? null) as PerformanceResult | null,
    notes: (arr.safeParse(row.notes).success ? row.notes : []) as string[],
    durationMs: row.duration_ms,
    ai: ai?.success ? { result: ai.data, provider: row.ai_provider, model: row.ai_model, generatedAt: row.ai_generated_at } : null,
    createdAt: row.created_at,
  };
}
