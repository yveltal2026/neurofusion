import { z } from "zod";
import { isSameSite, normalizeUrl } from "./engine/url";

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .url("Escribe una URL completa, p. ej. https://www.ejemplo.com")
  .refine(
    (u) => /^https?:\/\//i.test(u),
    "La URL debe empezar con http:// o https://",
  );

/** Configuración de un estudio SEO (se guarda en studies.config). */
export const pageTargetSchema = z.object({
  url: httpUrl,
  keyword: z.string().trim().max(80).nullable().default(null),
  goal: z.string().trim().max(300).default(""),
  indexable: z.boolean().default(true),
});

export type PageTarget = z.infer<typeof pageTargetSchema>;

export const seoConfigSchema = z
  .object({
    siteUrl: httpUrl,
    extraUrls: z
      .array(httpUrl)
      .max(20, "Máximo 20 URLs adicionales")
      .default([]),
    maxPages: z.number().int().min(1).max(25).default(10),
    targetKeyword: z.string().trim().max(80).nullable().default(null),
    pageTargets: z.array(pageTargetSchema).max(25).default([]),
    checkPerformance: z.boolean().default(true),
    strategy: z.enum(["mobile", "desktop"]).default("mobile"),
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>();
    config.pageTargets.forEach((target, i) => {
      const url = normalizeUrl(target.url)!;
      if (!isSameSite(url, config.siteUrl))
        ctx.addIssue({
          code: "custom",
          path: ["pageTargets", i, "url"],
          message: "Los objetivos deben pertenecer al sitio auditado.",
        });
      if (seen.has(url))
        ctx.addIssue({
          code: "custom",
          path: ["pageTargets", i, "url"],
          message: "Hay objetivos repetidos para la misma URL.",
        });
      seen.add(url);
    });
  });

export type SeoConfig = z.infer<typeof seoConfigSchema>;

/** La coincidencia es por URL normalizada; conserva barra final y parámetros. */
export function targetForUrl(
  config: Pick<SeoConfig, "targetKeyword"> & { pageTargets?: PageTarget[] },
  url: string,
) {
  const target = config.pageTargets?.find(
    (t) => normalizeUrl(t.url) === normalizeUrl(url),
  );
  return {
    keyword: target ? target.keyword : config.targetKeyword,
    goal: target?.goal ?? "",
    indexable: target?.indexable ?? true,
  };
}

export function pageTargetsFromForm(fd: FormData): unknown[] {
  return fd.getAll("targetUrl").map((url, i) => ({
    url: String(url).trim(),
    keyword: String(fd.getAll("pageKeyword")[i] ?? "").trim() || null,
    goal: String(fd.getAll("pageGoal")[i] ?? "").trim(),
    indexable: fd.getAll("pageIndexing")[i] !== "exclude",
  }));
}
