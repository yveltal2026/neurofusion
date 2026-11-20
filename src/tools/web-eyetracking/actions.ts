"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { generateMagicToken } from "@/lib/magic-link";
import {
  originFromUrl,
  webEyetrackingConfigSchema,
} from "./config";

export interface WebEyetrackingFormState {
  error?: string;
}

const uuid = z.string().uuid();
const createSchema = z.object({
  projectId: uuid,
  name: z.string().trim().min(1, "Escribe un nombre para el estudio").max(160),
  config: z.unknown(),
});

export async function createWebEyetrackingStudy(
  raw: unknown,
): Promise<WebEyetrackingFormState> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const rawCfg = (parsed.data.config ?? {}) as Record<string, unknown>;
  const baseOrigin =
    typeof rawCfg.targetUrl === "string" ? originFromUrl(rawCfg.targetUrl) : null;
  const existingOrigins = Array.isArray(rawCfg.allowedOrigins)
    ? rawCfg.allowedOrigins
    : [];
  const mergedOrigins = Array.from(
    new Set([
      ...(baseOrigin ? [baseOrigin] : []),
      ...existingOrigins.filter((o): o is string => typeof o === "string" && o.length > 0),
    ]),
  );

  const config = webEyetrackingConfigSchema.safeParse({
    ...rawCfg,
    allowedOrigins: mergedOrigins,
  });
  if (!config.success) {
    return {
      error: config.error.issues[0]?.message ?? "La configuración no es válida",
    };
  }

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("studies")
    .insert({
      project_id: parsed.data.projectId,
      tool_type: "web_eyetracking",
      name: parsed.data.name,
      status: "published",
      config: config.data,
      access_token: generateMagicToken(),
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      error: "No se pudo crear el estudio. Verifica que el proyecto exista.",
    };
  }

  redirect(`/studies/${data.id}?created=1`);
}
