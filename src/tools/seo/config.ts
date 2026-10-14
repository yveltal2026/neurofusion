import { z } from "zod";

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .url("Escribe una URL completa, p. ej. https://www.ejemplo.com")
  .refine((u) => /^https?:\/\//i.test(u), "La URL debe empezar con http:// o https://");

/** Configuración de un estudio SEO (se guarda en studies.config). */
export const seoConfigSchema = z.object({
  siteUrl: httpUrl,
  extraUrls: z.array(httpUrl).max(20, "Máximo 20 URLs adicionales").default([]),
  maxPages: z.number().int().min(1).max(25).default(10),
  targetKeyword: z.string().trim().max(80).nullable().default(null),
  checkPerformance: z.boolean().default(true),
  strategy: z.enum(["mobile", "desktop"]).default("mobile"),
});

export type SeoConfig = z.infer<typeof seoConfigSchema>;
