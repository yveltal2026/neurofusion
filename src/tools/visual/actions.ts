"use server";

import { randomInt, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { generateMagicToken } from "@/lib/magic-link";
import { AiError, generateStructured, getAnalysisProvider, type ContentPart } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import type { FrictionRatingRow, StudyRow, VisualAssetRow } from "@/lib/db/types";
import { ASSETS_BUCKET } from "@/lib/study-files";
import { buildSuggestText, suggestionsSchema, SUGGEST_SYSTEM_PROMPT } from "./analysis/journey";
import { buildPieceUserText, elementsToAois, PIECE_SYSTEM_PROMPT, pieceAiSchema, VISION_ENGINE_VERSION } from "./analysis/piece";
import { journeyConfigSchema, siteKey, visualConfigSchema, type JourneyConfig, type VisualConfig } from "./config";
import { aoiListSchema } from "./engine/aoi";
import { METRICS_VERSION } from "./engine/metrics";
import { getPlacement } from "./engine/placements";
import { imageForVision, imageMetrics, imageRenditions, inspectImage, textContrasts } from "./image.server";
import { buildRatings, missingRatings } from "./journey/ratings";
import { DEFAULT_PANEL_N, ENGINE_VERSION, generatePanel, IFD_VERSION, runSite, sensitivity } from "./journey/model";
import { RUBRIC_VERSION, rubricItems } from "./journey/rubric";
import { renditionPath, storedAiSchema, toVisualAsset, type StoredAi } from "./results";

export interface VisualFormState {
  error?: string;
  ok?: boolean;
  message?: string;
}

const uuid = z.string().uuid();
const MAX_ASSETS = 80;
const MAX_VISION_PER_HOUR = 30;
const MAX_SUGGEST_PER_HOUR = 10;
const MAX_IFD_RUNS_PER_HOUR = 20;

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

async function loadVisualStudy(supabase: Supabase, id: string): Promise<{ study: StudyRow; config: VisualConfig } | null> {
  const { data } = await supabase.from("studies").select("*").eq("id", id).eq("tool_type", "visual").maybeSingle<StudyRow>();
  if (!data) return null;
  const config = visualConfigSchema.safeParse(data.config);
  return config.success ? { study: data, config: config.data } : null;
}

async function download(supabase: Supabase, path: string): Promise<Buffer | null> {
  const { data, error } = await supabase.storage.from(ASSETS_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

// ------------------------------------------------------------------ estudio

const createSchema = z.object({ projectId: uuid, name: z.string().trim().min(1, "Escribe un nombre para el estudio").max(160), config: z.unknown() });

export async function createVisualStudy(raw: unknown): Promise<VisualFormState> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const input = parsed.data.config as Record<string, unknown> | null;
  // La semilla la fija el servidor si no viene (reproducible y no elegida a modo).
  if (input && input.mode === "journey") input.panel = { seed: randomInt(1, 2_147_483_647), ...(input.panel as object) };
  const config = visualConfigSchema.safeParse(input);
  if (!config.success) return { error: config.error.issues[0]?.message ?? "La configuración no es válida" };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("studies")
    .insert({
      project_id: parsed.data.projectId,
      tool_type: "visual",
      name: parsed.data.name,
      status: "published",
      config: config.data,
      access_token: config.data.mode === "pieces" && config.data.eyeTracking ? generateMagicToken() : null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear el estudio. Verifica que el proyecto exista." };
  redirect(`/studies/${data.id}?created=1`);
}

export async function updateVisualContext(_prev: VisualFormState, fd: FormData): Promise<VisualFormState> {
  const id = uuid.safeParse(fd.get("studyId"));
  if (!id.success) return { error: "Solicitud inválida" };
  const { supabase } = await requireUser();
  const loaded = await loadVisualStudy(supabase, id.data);
  if (!loaded) return { error: "Estudio no encontrado" };
  const next: Record<string, unknown> = {
    ...loaded.config,
    objective: String(fd.get("objective") ?? ""),
    brand: String(fd.get("brand") ?? ""),
    audience: String(fd.get("audience") ?? ""),
  };
  if (loaded.config.mode === "journey") {
    next.productTarget = String(fd.get("productTarget") ?? "");
    const name = String(fd.get("newSiteName") ?? "").trim();
    const url = String(fd.get("newSiteUrl") ?? "").trim();
    if (name || url) {
      next.sites = [...loaded.config.sites, { key: siteKey(name, loaded.config.sites.map((s) => s.key)), name, url, competitor: true }];
    }
  }
  const config = visualConfigSchema.safeParse(next);
  if (!config.success) return { error: config.error.issues[0]?.message ?? "Datos inválidos" };
  const { error } = await supabase.from("studies").update({ config: config.data }).eq("id", id.data);
  if (error) return { error: "No se pudieron guardar los cambios" };
  revalidatePath(`/studies/${id.data}`, "layout");
  return { ok: true };
}

/** Re-medición: mismo diseño y semilla, sin capturas ni calificaciones (se califica de nuevo). */
export async function createRemeasurement(fd: FormData) {
  const id = uuid.safeParse(fd.get("studyId"));
  if (!id.success) return;
  const { supabase } = await requireUser();
  const loaded = await loadVisualStudy(supabase, id.data);
  if (!loaded || loaded.config.mode !== "journey") return;
  const config: JourneyConfig = { ...loaded.config, remeasurementOf: loaded.config.remeasurementOf ?? loaded.study.id };
  const date = new Date().toLocaleDateString("es-MX", { month: "short", year: "numeric" });
  const { data } = await supabase
    .from("studies")
    .insert({
      project_id: loaded.study.project_id,
      tool_type: "visual",
      name: `${loaded.study.name.replace(/ · re-medición .*$/, "").slice(0, 120)} · re-medición ${date}`,
      status: "published",
      config,
    })
    .select("id")
    .single();
  if (data) redirect(`/studies/${data.id}?created=1`);
}

// ------------------------------------------------------------------ archivos

const registerSchema = z.object({
  studyId: uuid,
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpe?g|webp)$/i, "Ruta inválida"),
  fileName: z.string().trim().min(1).max(200),
  title: z.string().trim().max(160).default(""),
  placement: z.string().trim().max(40).nullable().default(null),
  siteKey: z.string().trim().max(40).nullable().default(null),
  taskId: z.string().trim().max(8).nullable().default(null),
});

/**
 * Registra un archivo ya subido al bucket: el servidor lo descarga, verifica que sea una
 * imagen real, calcula su huella y sus métricas, y crea la fila. Si algo falla, borra el objeto.
 */
export async function registerAsset(raw: unknown): Promise<VisualFormState> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const input = parsed.data;
  const { supabase } = await requireUser();
  const bucket = supabase.storage.from(ASSETS_BUCKET);
  const fail = async (error: string) => {
    await bucket.remove([input.path]);
    return { error };
  };
  if (!input.path.startsWith(`${input.studyId}/`)) return fail("Ruta inválida");

  const loaded = await loadVisualStudy(supabase, input.studyId);
  if (!loaded) return fail("Estudio no encontrado");
  const { count } = await supabase.from("visual_assets").select("id", { count: "exact", head: true }).eq("study_id", input.studyId);
  const eyeStudy = loaded.config.mode === "pieces" && Boolean(loaded.config.eyeTracking);
  const limit = eyeStudy ? 5 : MAX_ASSETS;
  if ((count ?? 0) >= limit) return fail(`Máximo ${limit} imágenes por estudio`);
  if (eyeStudy) {
    const { count: runs } = await supabase.from("eye_tracking_runs").select("session_id", { count: "exact", head: true }).eq("study_id", input.studyId);
    const { count: active } = await supabase.from("sessions").select("id", { count: "exact", head: true })
      .eq("study_id", input.studyId).eq("status", "started")
      .gte("started_at", new Date(Date.now() - 2 * 60 * 60_000).toISOString());
    if (runs || active) return fail("El estudio ya tiene respuestas o sesiones en curso; las piezas quedaron fijadas para poder compararlas");
  }

  if (loaded.config.mode === "journey") {
    if (!loaded.config.sites.some((s) => s.key === input.siteKey)) return fail("Elige el sitio de la captura");
    if (!loaded.config.tasks.some((t) => t.id === input.taskId)) return fail("Elige la tarea de la captura");
  }
  if (input.placement && !getPlacement(input.placement)) return fail("Formato desconocido");

  const buf = await download(supabase, input.path);
  if (!buf) return fail("No se pudo leer el archivo subido");
  let info;
  let metrics;
  try {
    info = await inspectImage(buf);
    metrics = await imageMetrics(buf);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "El archivo no es una imagen válida");
  }

  let posQuery = supabase.from("visual_assets").select("id", { count: "exact", head: true }).eq("study_id", input.studyId);
  if (loaded.config.mode === "journey") posQuery = posQuery.eq("site_key", input.siteKey ?? "").eq("task_id", input.taskId ?? "");
  const { count: pos } = await posQuery;
  const { error } = await supabase.from("visual_assets").insert({
    study_id: input.studyId,
    storage_path: input.path,
    file_name: input.fileName,
    mime_type: info.mime,
    width: info.width,
    height: info.height,
    bytes: info.bytes,
    sha256: info.sha256,
    title: input.title || input.fileName.replace(/\.[a-z0-9]+$/i, "").slice(0, 160) || "Imagen",
    placement: input.placement,
    site_key: loaded.config.mode === "journey" ? input.siteKey : null,
    task_id: loaded.config.mode === "journey" ? input.taskId : null,
    position: pos ?? 0,
    metrics,
    metrics_version: METRICS_VERSION,
  });
  if (error) return fail("No se pudo registrar la imagen");
  // Versiones ligeras para la interfaz. Si fallan no se pierde nada: se muestra el original.
  try {
    const { thumb, view } = await imageRenditions(buf);
    await Promise.all([
      bucket.upload(renditionPath(input.path, "thumb"), thumb, { contentType: "image/webp", upsert: false }),
      bucket.upload(renditionPath(input.path, "view"), view, { contentType: "image/webp", upsert: false }),
    ]);
  } catch {
    // sin versiones ligeras
  }
  revalidatePath(`/studies/${input.studyId}`);
  return { ok: true };
}

export async function updateAssetMeta(_prev: VisualFormState, fd: FormData): Promise<VisualFormState> {
  const studyId = uuid.safeParse(fd.get("studyId"));
  const assetId = uuid.safeParse(fd.get("assetId"));
  const title = z.string().trim().min(1, "Escribe un título").max(160).safeParse(fd.get("title"));
  const placement = String(fd.get("placement") ?? "") || null;
  if (!studyId.success || !assetId.success) return { error: "Solicitud inválida" };
  if (!title.success) return { error: title.error.issues[0].message };
  if (placement && !getPlacement(placement)) return { error: "Formato desconocido" };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("visual_assets").update({ title: title.data, placement }).eq("id", assetId.data).eq("study_id", studyId.data).select("id");
  if (error || !data?.length) return { error: "No se pudo guardar" };
  revalidatePath(`/studies/${studyId.data}/assets/${assetId.data}`);
  return { ok: true };
}

export async function deleteAsset(fd: FormData) {
  const studyId = uuid.safeParse(fd.get("studyId"));
  const assetId = uuid.safeParse(fd.get("assetId"));
  if (!studyId.success || !assetId.success) return;
  const { supabase } = await requireUser();
  const { count: runs } = await supabase.from("eye_tracking_runs")
    .select("session_id", { count: "exact", head: true }).eq("study_id", studyId.data);
  const { count: active } = await supabase.from("sessions").select("id", { count: "exact", head: true })
    .eq("study_id", studyId.data).eq("status", "started")
    .gte("started_at", new Date(Date.now() - 2 * 60 * 60_000).toISOString());
  if (runs || active) return;
  const { data } = await supabase.from("visual_assets").select("storage_path").eq("id", assetId.data).eq("study_id", studyId.data).maybeSingle();
  if (!data) return;
  await supabase.storage
    .from(ASSETS_BUCKET)
    .remove([data.storage_path, renditionPath(data.storage_path, "thumb"), renditionPath(data.storage_path, "view")]);
  await supabase.from("visual_assets").delete().eq("id", assetId.data);
  redirect(`/studies/${studyId.data}`);
}

// ------------------------------------------------------------------ IA de visión

/** Lectura visual con IA: elementos, AOI, criterios y problemas. */
export async function analyzeAsset(_prev: VisualFormState, fd: FormData): Promise<VisualFormState> {
  const studyId = uuid.safeParse(fd.get("studyId"));
  const assetId = uuid.safeParse(fd.get("assetId"));
  if (!studyId.success || !assetId.success) return { error: "Solicitud inválida" };
  const { supabase } = await requireUser();
  const loaded = await loadVisualStudy(supabase, studyId.data);
  if (!loaded) return { error: "Estudio no encontrado" };
  const { data: row } = await supabase.from("visual_assets").select("*").eq("id", assetId.data).eq("study_id", studyId.data).maybeSingle<VisualAssetRow>();
  if (!row) return { error: "Imagen no encontrada" };

  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await supabase.from("visual_assets").select("id", { count: "exact", head: true }).eq("study_id", studyId.data).gte("ai_generated_at", since);
  if ((count ?? 0) >= MAX_VISION_PER_HOUR) return { error: "Alcanzaste el límite de análisis con IA por hora en este estudio." };

  const buf = await download(supabase, row.storage_path);
  if (!buf) return { error: "No se pudo leer la imagen" };
  const { plan, parts } = await imageForVision(buf);
  const cfg = loaded.config;
  const site = cfg.mode === "journey" ? cfg.sites.find((s) => s.key === row.site_key) : null;
  const task = cfg.mode === "journey" ? cfg.tasks.find((t) => t.id === row.task_id) : null;
  const user: ContentPart[] = [
    ...parts,
    {
      type: "text",
      text: buildPieceUserText({
        objective: cfg.objective,
        brand: cfg.brand,
        audience: cfg.audience,
        title: row.title,
        placement: getPlacement(row.placement)?.label ?? null,
        journey: site && task ? { site: site.name, task: `${task.name}: ${task.instruction}` } : null,
        tiles: parts.length,
        coverage: plan.coverage,
      }),
    },
  ];

  try {
    const provider = getAnalysisProvider();
    const { data, model } = await generateStructured({ provider, system: PIECE_SYSTEM_PROMPT, user, schema: pieceAiSchema });
    const aois = elementsToAois(data, plan);
    const stored: StoredAi = storedAiSchema.parse({ result: data, aois, coverage: plan.coverage, tiles: parts.length });
    const contrast = await textContrasts(buf, aois);
    const keepAnalyst = row.aois_source === "analyst";
    const { error } = await supabase
      .from("visual_assets")
      .update({
        ai_result: stored,
        ai_provider: provider.name,
        ai_model: model,
        ai_engine_version: VISION_ENGINE_VERSION,
        ai_generated_at: new Date().toISOString(),
        metrics: { ...(row.metrics as object), textContrast: contrast },
        ...(keepAnalyst ? {} : { aois, aois_source: "ai", aois_reviewed_at: null, aois_reviewed_by: null }),
      })
      .eq("id", row.id);
    if (error) return { error: "El análisis se generó pero no se pudo guardar." };
    revalidatePath(`/studies/${studyId.data}/assets/${assetId.data}`);
    return { ok: true, message: keepAnalyst ? "Análisis actualizado. Se conservaron tus áreas de interés revisadas." : undefined };
  } catch (e) {
    if (e instanceof AiError) return { error: e.message };
    return { error: "No se pudo completar el análisis. Inténtalo de nuevo." };
  }
}

const saveAoisSchema = z.object({ studyId: uuid, assetId: uuid, aois: aoiListSchema });

/** El analista confirma o corrige las áreas de interés (checkpoint humano). */
export async function saveAois(raw: unknown): Promise<VisualFormState> {
  const parsed = saveAoisSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Áreas de interés inválidas" };
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("visual_assets")
    .update({ aois: parsed.data.aois, aois_source: "analyst", aois_reviewed_at: new Date().toISOString(), aois_reviewed_by: user.id })
    .eq("id", parsed.data.assetId)
    .eq("study_id", parsed.data.studyId)
    .select("id, metrics, storage_path");
  if (error || !data?.length) return { error: "No se pudieron guardar las áreas de interés" };
  // Recalcula el contraste estimado de las cajas de texto corregidas.
  const buf = await download(supabase, data[0].storage_path);
  if (buf) {
    const contrast = await textContrasts(buf, parsed.data.aois);
    await supabase.from("visual_assets").update({ metrics: { ...(data[0].metrics as object), textContrast: contrast } }).eq("id", parsed.data.assetId);
  }
  revalidatePath(`/studies/${parsed.data.studyId}/assets/${parsed.data.assetId}`);
  return { ok: true };
}

export async function restoreAiAois(fd: FormData) {
  const studyId = uuid.safeParse(fd.get("studyId"));
  const assetId = uuid.safeParse(fd.get("assetId"));
  if (!studyId.success || !assetId.success) return;
  const { supabase } = await requireUser();
  const { data: row } = await supabase.from("visual_assets").select("*").eq("id", assetId.data).eq("study_id", studyId.data).maybeSingle<VisualAssetRow>();
  if (!row) return;
  const asset = toVisualAsset(row);
  if (!asset.ai) return;
  await supabase.from("visual_assets").update({ aois: asset.ai.aois, aois_source: "ai", aois_reviewed_at: null, aois_reviewed_by: null }).eq("id", row.id);
  revalidatePath(`/studies/${studyId.data}/assets/${assetId.data}`);
}

// ------------------------------------------------------------------ journey: calificación

export async function saveRating(_prev: VisualFormState, fd: FormData): Promise<VisualFormState> {
  const studyId = uuid.safeParse(fd.get("studyId"));
  if (!studyId.success) return { error: "Solicitud inválida" };
  const { supabase } = await requireUser();
  const loaded = await loadVisualStudy(supabase, studyId.data);
  if (!loaded || loaded.config.mode !== "journey") return { error: "Estudio no encontrado" };
  const cfg = loaded.config;
  const site = String(fd.get("siteKey") ?? "");
  const item = String(fd.get("itemKey") ?? "");
  if (!cfg.sites.some((s) => s.key === site)) return { error: "Sitio inválido" };
  const rubricItem = rubricItems(cfg.tasks).find((i) => i.key === item);
  if (!rubricItem) return { error: "Ítem de rúbrica inválido" };

  const value = Number(fd.get("value"));
  const range = rubricItem.kind === "base" ? [0.04, 0.97] : [0, 1];
  if (!Number.isFinite(value) || value < range[0] || value > range[1]) return { error: `El valor debe estar entre ${range[0]} y ${range[1]}` };
  if (rubricItem.kind === "boolean" && value !== 0 && value !== 1) return { error: "Este ítem sólo admite Sí o No" };
  const justification = String(fd.get("justification") ?? "").trim();
  if (justification.length < 10) return { error: "La justificación debe citar evidencia (mínimo 10 caracteres)" };
  if (justification.length > 2000) return { error: "Máximo 2000 caracteres" };
  const evidence = String(fd.get("evidenceAssetId") ?? "");
  if (evidence && !uuid.safeParse(evidence).success) return { error: "Evidencia inválida" };
  if (evidence) {
    const { data: ev } = await supabase.from("visual_assets").select("id").eq("id", evidence).eq("study_id", studyId.data).eq("site_key", site).maybeSingle();
    if (!ev) return { error: "La evidencia debe ser una captura de este sitio" };
  }
  const source = fd.get("source") === "ai_assisted" ? "ai_assisted" : "analyst";

  const { error } = await supabase.from("friction_ratings").upsert(
    {
      study_id: studyId.data,
      site_key: site,
      item_key: item,
      value,
      justification,
      evidence_asset_id: evidence || null,
      source,
      rubric_version: RUBRIC_VERSION,
    },
    { onConflict: "study_id,site_key,item_key" },
  );
  if (error) return { error: "No se pudo guardar la calificación" };
  revalidatePath(`/studies/${studyId.data}/ratings`);
  return { ok: true };
}

/** La IA propone calificaciones a partir de las capturas del sitio; el analista decide. */
export async function suggestRatings(_prev: VisualFormState, fd: FormData): Promise<VisualFormState> {
  const studyId = uuid.safeParse(fd.get("studyId"));
  const site = String(fd.get("siteKey") ?? "");
  if (!studyId.success) return { error: "Solicitud inválida" };
  const { supabase } = await requireUser();
  const loaded = await loadVisualStudy(supabase, studyId.data);
  if (!loaded || loaded.config.mode !== "journey") return { error: "Estudio no encontrado" };
  const cfg = loaded.config;
  const siteDef = cfg.sites.find((s) => s.key === site);
  if (!siteDef) return { error: "Sitio inválido" };

  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await supabase.from("friction_suggestions").select("id", { count: "exact", head: true }).eq("study_id", studyId.data).gte("created_at", since);
  if ((count ?? 0) >= MAX_SUGGEST_PER_HOUR) return { error: "Alcanzaste el límite de sugerencias por hora." };

  const { data: rows } = await supabase.from("visual_assets").select("*").eq("study_id", studyId.data).eq("site_key", site).returns<VisualAssetRow[]>();
  const taskOrder = new Map(cfg.tasks.map((t, i) => [t.id, i]));
  const assets = (rows ?? [])
    .sort((a, b) => (taskOrder.get(a.task_id ?? "") ?? 99) - (taskOrder.get(b.task_id ?? "") ?? 99) || a.position - b.position)
    .slice(0, 8);
  if (!assets.length) return { error: "Sube primero capturas de este sitio." };

  const parts: ContentPart[] = [];
  const described: { index: number; task: string; title: string; assetId: string }[] = [];
  for (const a of assets) {
    const buf = await download(supabase, a.storage_path);
    if (!buf) continue;
    const { parts: tiles } = await imageForVision(buf);
    parts.push(tiles[0]);
    const t = cfg.tasks.find((x) => x.id === a.task_id);
    described.push({ index: described.length, task: t ? `${t.id} ${t.name}` : "—", title: a.title, assetId: a.id });
  }
  const items = rubricItems(cfg.tasks);
  parts.push({ type: "text", text: buildSuggestText({ site: siteDef.name, url: siteDef.url, productTarget: cfg.productTarget, items, images: described }) });

  try {
    const provider = getAnalysisProvider();
    const { data, model } = await generateStructured({ provider, system: SUGGEST_SYSTEM_PROMPT, user: parts, schema: suggestionsSchema });
    const valid = data.suggestions
      .filter((s) => items.some((i) => i.key === s.item))
      .map((s) => {
        const it = items.find((i) => i.key === s.item)!;
        const value = it.kind === "boolean" ? (s.value >= 0.5 ? 1 : 0) : it.kind === "base" ? Math.min(0.97, Math.max(0.04, s.value)) : s.value;
        return { ...s, value, evidenceAssetId: s.evidenceImage !== null ? (described[s.evidenceImage]?.assetId ?? null) : null };
      });
    const { error } = await supabase.from("friction_suggestions").insert({
      study_id: studyId.data,
      site_key: site,
      result: { suggestions: valid, notObservable: data.notObservable },
      provider: provider.name,
      model,
    });
    if (error) return { error: "Las sugerencias se generaron pero no se pudieron guardar." };
  } catch (e) {
    if (e instanceof AiError) return { error: e.message };
    return { error: "No se pudieron generar sugerencias. Inténtalo de nuevo." };
  }
  revalidatePath(`/studies/${studyId.data}/ratings`);
  return { ok: true };
}

// ------------------------------------------------------------------ journey: IFD

/** Corre el modelo para todos los sitios con la misma semilla y guarda las mediciones. */
export async function runIfd(_prev: VisualFormState, fd: FormData): Promise<VisualFormState> {
  const studyId = uuid.safeParse(fd.get("studyId"));
  if (!studyId.success) return { error: "Solicitud inválida" };
  const { supabase } = await requireUser();
  const loaded = await loadVisualStudy(supabase, studyId.data);
  if (!loaded || loaded.config.mode !== "journey") return { error: "Estudio no encontrado" };
  const cfg = journeyConfigSchema.parse(loaded.config);

  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await supabase.from("ifd_measurements").select("id", { count: "exact", head: true }).eq("study_id", studyId.data).gte("created_at", since);
  if ((count ?? 0) >= MAX_IFD_RUNS_PER_HOUR * cfg.sites.length) return { error: "Demasiadas corridas en la última hora." };

  const { data: ratingRows } = await supabase.from("friction_ratings").select("*").eq("study_id", studyId.data).returns<FrictionRatingRow[]>();
  const ratings = ratingRows ?? [];
  const missing = cfg.sites.flatMap((s) => missingRatings(cfg, ratings, s.key).map((k) => `${s.name}: ${k}`));
  if (missing.length) return { error: `Faltan ${missing.length} calificación(es), p. ej. ${missing.slice(0, 3).join("; ")}.` };

  const panel = generatePanel(cfg.panel.quotas, DEFAULT_PANEL_N, cfg.panel.seed);
  const runId = randomUUID();
  const rows = cfg.sites.map((s) => {
    const r = buildRatings(cfg, ratings, s.key);
    const { summary, ifd } = runSite(panel, r, cfg.tasks, cfg.panel.seed);
    const sens = sensitivity(cfg.panel.quotas, r, cfg.tasks, cfg.panel.seed);
    return {
      study_id: studyId.data,
      run_id: runId,
      site_key: s.key,
      site_name: s.name,
      site_url: s.url,
      is_competitor: s.competitor,
      engine_version: ENGINE_VERSION,
      ifd_version: IFD_VERSION,
      calibration_version: cfg.panel.calibration,
      rubric_version: RUBRIC_VERSION,
      seed: cfg.panel.seed,
      n_panel: DEFAULT_PANEL_N,
      inputs: { ratings: r, tasks: cfg.tasks, quotas: cfg.panel.quotas, sensitivity: sens },
      summary,
      score: ifd.score,
      ifd: ifd.ifd,
      reading: ifd.reading,
    };
  });
  const { error } = await supabase.from("ifd_measurements").insert(rows);
  if (error) return { error: "No se pudo guardar la medición." };
  revalidatePath(`/studies/${studyId.data}/results`);
  return { ok: true };
}
