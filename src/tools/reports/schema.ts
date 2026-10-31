import { z } from "zod";

export const REPORT_KINDS = ["survey", "eye", "visual"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_VERSION = "cognia-report-1";

/** La IA redacta; los cálculos y las gráficas proceden de los motores. */
export const briefReportSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(1500),
  findings: z
    .array(
      z.object({
        headline: z.string().trim().min(1).max(160),
        evidence: z.string().trim().min(1).max(600),
      }),
    )
    .min(1)
    .max(5),
  recommendations: z.array(z.string().trim().min(1).max(500)).min(1).max(5),
  limitations: z.array(z.string().trim().min(1).max(500)).min(1).max(5),
});
export type BriefReport = z.infer<typeof briefReportSchema>;

export const storedReportSchema = z.object({
  kind: z.literal("study_report"),
  version: z.literal(REPORT_VERSION),
  sourceKind: z.enum(REPORT_KINDS),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  report: briefReportSchema,
});
export type StoredReport = z.infer<typeof storedReportSchema>;
