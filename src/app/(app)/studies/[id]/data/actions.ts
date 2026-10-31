"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";

const schema = z.object({
  studyId: z.string().uuid(),
  sessionId: z.string().uuid(),
  excluded: z.enum(["true", "false"]),
  reason: z.string().trim().max(200).optional(),
});

/** Excluye (o reincorpora) una sesión del análisis. RLS + GRANT por columna limitan qué se puede editar. */
export async function setSessionExcluded(formData: FormData) {
  const parsed = schema.safeParse({
    studyId: formData.get("studyId"),
    sessionId: formData.get("sessionId"),
    excluded: formData.get("excluded"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return;
  const { studyId, sessionId, excluded, reason } = parsed.data;
  const { supabase } = await requireUser();
  await supabase
    .from("sessions")
    .update({ excluded: excluded === "true", excluded_reason: excluded === "true" ? (reason ?? null) : null })
    .eq("id", sessionId)
    .eq("study_id", studyId);
  revalidatePath(`/studies/${studyId}/data`);
  revalidatePath(`/studies/${studyId}/data/${sessionId}`);
  revalidatePath(`/studies/${studyId}/analysis`);
  revalidatePath(`/studies/${studyId}/eye`);
  revalidatePath(`/studies/${studyId}/report`);
  revalidatePath(`/studies/${studyId}/responses`);
}
