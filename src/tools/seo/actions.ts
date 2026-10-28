"use server";

import { lookup } from "node:dns/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AiError, generateStructured, getAnalysisProvider } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import type { SeoAuditRow } from "@/lib/db/types";
import { buildSeoUserPrompt, SEO_SYSTEM_PROMPT } from "./analysis/prompt";
import { seoAiResultSchema } from "./analysis/schema";
import { pageTargetsFromForm, seoConfigSchema } from "./config";
import {
  runLiveAudit,
  runUploadAudit,
  type AuditOutcome,
  type UploadedPage,
} from "./crawl";
import { BlockedUrlError } from "./net-guard";
import { toSeoAudit } from "./results";

export interface SeoFormState {
  error?: string;
  ok?: boolean;
}

const MAX_AUDITS_PER_HOUR = 6;
const MAX_AI_PER_HOUR = 10;
const MAX_UPLOAD_FILES = 10;
const MAX_UPLOAD_FILE_BYTES = 1_500_000;
const MAX_UPLOAD_TOTAL_BYTES = 3_500_000;

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

function configFromForm(fd: FormData): unknown {
  return {
    siteUrl: String(fd.get("siteUrl") ?? "").trim(),
    extraUrls: lines(fd.get("extraUrls")),
    maxPages: Number(fd.get("maxPages") ?? 10),
    targetKeyword: String(fd.get("targetKeyword") ?? "").trim() || null,
    pageTargets: pageTargetsFromForm(fd),
    checkPerformance: fd.get("checkPerformance") === "on",
    strategy: fd.get("strategy") === "desktop" ? "desktop" : "mobile",
  };
}

async function loadSeoStudy(id: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("studies")
    .select("id, project_id, config")
    .eq("id", id)
    .eq("tool_type", "seo")
    .maybeSingle();
  if (!data) return { supabase, study: null, config: null };
  const config = seoConfigSchema.safeParse(data.config);
  return { supabase, study: data, config: config.success ? config.data : null };
}

export async function createSeoStudy(
  _prev: SeoFormState,
  fd: FormData,
): Promise<SeoFormState> {
  const projectId = z.string().uuid().safeParse(fd.get("projectId"));
  const name = z
    .string()
    .trim()
    .min(1, "Escribe un nombre para el estudio")
    .max(160)
    .safeParse(fd.get("name"));
  const config = seoConfigSchema.safeParse(configFromForm(fd));
  if (!projectId.success) return { error: "Proyecto inválido" };
  if (!name.success) return { error: name.error.issues[0].message };
  if (!config.success)
    return {
      error: config.error.issues[0]?.message ?? "Configuración inválida",
    };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("studies")
    .insert({
      project_id: projectId.data,
      tool_type: "seo",
      name: name.data,
      status: "published",
      config: config.data,
    })
    .select("id")
    .single();
  if (error || !data)
    return {
      error: "No se pudo crear el estudio. Verifica que el proyecto exista.",
    };
  redirect(`/studies/${data.id}?created=1`);
}

export async function updateSeoConfig(
  _prev: SeoFormState,
  fd: FormData,
): Promise<SeoFormState> {
  const id = z.string().uuid().safeParse(fd.get("studyId"));
  const config = seoConfigSchema.safeParse(configFromForm(fd));
  if (!id.success) return { error: "Solicitud inválida" };
  if (!config.success)
    return {
      error: config.error.issues[0]?.message ?? "Configuración inválida",
    };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("studies")
    .update({ config: config.data })
    .eq("id", id.data)
    .eq("tool_type", "seo")
    .select("id");
  if (error || !data?.length)
    return { error: "No se pudieron guardar los cambios" };
  revalidatePath(`/studies/${id.data}`);
  return { ok: true };
}

async function underHourlyLimit(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  studyId: string,
  max: number,
  column = "created_at",
) {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await supabase
    .from("seo_audits")
    .select("id", { count: "exact", head: true })
    .eq("study_id", studyId)
    .gte(column, since);
  return (count ?? 0) < max;
}

async function saveAudit(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  studyId: string,
  out: AuditOutcome,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("seo_audits")
    .insert({
      study_id: studyId,
      mode: out.mode,
      site_url: out.siteUrl,
      engine_version: out.engineVersion,
      summary: out.summary,
      pages: out.pages,
      findings: out.findings,
      performance: out.performance,
      notes: out.notes,
      duration_ms: out.durationMs,
    })
    .select("id")
    .single();
  return error || !data ? null : data.id;
}

/** Auditoría en vivo desde el servidor. Puede tardar hasta ~90 s. */
export async function runSeoLiveAudit(
  _prev: SeoFormState,
  fd: FormData,
): Promise<SeoFormState> {
  const id = z.string().uuid().safeParse(fd.get("studyId"));
  if (!id.success) return { error: "Solicitud inválida" };
  const { supabase, study, config } = await loadSeoStudy(id.data);
  if (!study || !config)
    return { error: "Estudio no encontrado o con configuración inválida" };
  if (!(await underHourlyLimit(supabase, id.data, MAX_AUDITS_PER_HOUR))) {
    return {
      error:
        "Alcanzaste el límite de auditorías por hora para este estudio. Inténtalo más tarde.",
    };
  }

  let out: AuditOutcome;
  try {
    out = await runLiveAudit(config, {
      fetch: globalThis.fetch,
      lookup: async (h) =>
        (await lookup(h, { all: true })).map((a) => a.address),
      now: Date.now,
      psiKey: process.env.PAGESPEED_API_KEY || undefined,
    });
  } catch (e) {
    if (e instanceof BlockedUrlError)
      return { error: `No se puede auditar esa URL: ${e.message}.` };
    return {
      error:
        "No se pudo completar la auditoría. Revisa la URL e inténtalo de nuevo.",
    };
  }
  const auditId = await saveAudit(supabase, id.data, out);
  if (!auditId)
    return {
      error:
        "La auditoría terminó pero no se pudo guardar. Inténtalo de nuevo.",
    };
  redirect(`/studies/${id.data}/audits/${auditId}`);
}

/** Modo asistido: HTML guardado por el analista (sitios que bloquean rastreadores). */
export async function runSeoUploadAudit(
  _prev: SeoFormState,
  fd: FormData,
): Promise<SeoFormState> {
  const id = z.string().uuid().safeParse(fd.get("studyId"));
  if (!id.success) return { error: "Solicitud inválida" };
  const { supabase, study, config } = await loadSeoStudy(id.data);
  if (!study || !config)
    return { error: "Estudio no encontrado o con configuración inválida" };

  const files = fd
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const urls = lines(fd.get("urls"));
  if (files.length === 0) return { error: "Sube al menos un archivo .html" };
  if (files.length > MAX_UPLOAD_FILES)
    return { error: `Máximo ${MAX_UPLOAD_FILES} archivos por auditoría` };
  if (urls.length !== files.length)
    return {
      error: `Escribe una URL por archivo, en el mismo orden (${files.length} archivo(s), ${urls.length} URL(s)).`,
    };
  if (files.some((f) => f.size > MAX_UPLOAD_FILE_BYTES))
    return { error: "Cada archivo debe pesar menos de 1.5 MB" };
  if (files.reduce((a, f) => a + f.size, 0) > MAX_UPLOAD_TOTAL_BYTES)
    return { error: "Los archivos suman más de 3.5 MB" };
  const urlCheck = z.array(z.string().url()).safeParse(urls);
  if (!urlCheck.success) return { error: "Alguna URL no es válida" };
  if (!(await underHourlyLimit(supabase, id.data, MAX_AUDITS_PER_HOUR))) {
    return {
      error:
        "Alcanzaste el límite de auditorías por hora para este estudio. Inténtalo más tarde.",
    };
  }

  const pages: UploadedPage[] = await Promise.all(
    files.map(async (f, i) => ({ url: urls[i], html: await f.text() })),
  );
  const out = runUploadAudit(config, pages, Date.now);
  const auditId = await saveAudit(supabase, id.data, out);
  if (!auditId)
    return { error: "No se pudo guardar la auditoría. Inténtalo de nuevo." };
  redirect(`/studies/${id.data}/audits/${auditId}`);
}

/** La IA redacta el plan de acción sobre los hallazgos ya calculados. */
export async function generateSeoPlan(
  _prev: SeoFormState,
  fd: FormData,
): Promise<SeoFormState> {
  const studyId = z.string().uuid().safeParse(fd.get("studyId"));
  const auditId = z.string().uuid().safeParse(fd.get("auditId"));
  if (!studyId.success || !auditId.success)
    return { error: "Solicitud inválida" };
  const { supabase, config } = await loadSeoStudy(studyId.data);
  if (!config) return { error: "Estudio no encontrado" };
  if (
    !(await underHourlyLimit(
      supabase,
      studyId.data,
      MAX_AI_PER_HOUR,
      "ai_generated_at",
    ))
  ) {
    return {
      error:
        "Alcanzaste el límite de planes con IA por hora para este estudio.",
    };
  }
  const { data: row } = await supabase
    .from("seo_audits")
    .select("*")
    .eq("id", auditId.data)
    .eq("study_id", studyId.data)
    .maybeSingle<SeoAuditRow>();
  if (!row) return { error: "Auditoría no encontrada" };
  const audit = toSeoAudit(row);

  try {
    const provider = getAnalysisProvider();
    const { data, model } = await generateStructured({
      provider,
      system: SEO_SYSTEM_PROMPT,
      user: buildSeoUserPrompt({
        ...audit,
        targetKeyword: audit.summary.scope?.targetKeyword ?? null,
      }),
      schema: seoAiResultSchema,
    });
    const { error } = await supabase
      .from("seo_audits")
      .update({
        ai_result: data,
        ai_provider: provider.name,
        ai_model: model,
        ai_generated_at: new Date().toISOString(),
      })
      .eq("id", auditId.data);
    if (error) return { error: "El plan se generó pero no se pudo guardar." };
  } catch (e) {
    if (e instanceof AiError) return { error: e.message };
    return { error: "No se pudo generar el plan. Inténtalo de nuevo." };
  }
  revalidatePath(`/studies/${studyId.data}/audits/${auditId.data}`);
  return { ok: true };
}

export async function deleteSeoAudit(fd: FormData) {
  const studyId = z.string().uuid().safeParse(fd.get("studyId"));
  const auditId = z.string().uuid().safeParse(fd.get("auditId"));
  if (!studyId.success || !auditId.success) return;
  const { supabase } = await requireUser();
  await supabase
    .from("seo_audits")
    .delete()
    .eq("id", auditId.data)
    .eq("study_id", studyId.data);
  redirect(`/studies/${studyId.data}`);
}
