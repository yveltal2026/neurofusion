"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import type { AudienceSegment } from "@/lib/db/types";
import { createAdminClient } from "@/lib/supabase/admin";

export interface MembershipActionState {
  error?: string;
  message?: string;
  ok?: boolean;
}

const requestSchema = z.object({
  requested_plan: z.enum([
    "academic_teacher",
    "academic_institution",
    "pro_researcher",
    "agency_team",
    "custom_credits",
  ]),
  organization_name: z
    .string()
    .trim()
    .min(2, "Escribe el nombre de tu empresa, agencia o institución.")
    .max(120, "Máximo 120 caracteres."),
  institutional_email: z
    .string()
    .trim()
    .email("Ingresa un correo de contacto válido.")
    .max(160)
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .trim()
    .max(1000, "Las notas deben tener máximo 1000 caracteres.")
    .optional(),
});

export async function submitMembershipRequestAction(
  _prev: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const parsed = requestSchema.safeParse({
    requested_plan: formData.get("requested_plan"),
    organization_name: formData.get("organization_name"),
    institutional_email: formData.get("institutional_email") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del formulario." };
  }

  const { supabase, user, orgId } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("audience_segment")
    .eq("id", user.id)
    .maybeSingle<{ audience_segment?: AudienceSegment }>();

  const audienceSegment: AudienceSegment = profile?.audience_segment ?? "other";

  const { error } = await supabase.from("membership_requests").insert({
    org_id: orgId,
    user_id: user.id,
    audience_segment: audienceSegment,
    requested_plan: parsed.data.requested_plan,
    organization_name: parsed.data.organization_name,
    institutional_email: parsed.data.institutional_email || user.email || null,
    notes: parsed.data.notes || null,
    status: "pending",
  });

  if (error) {
    return { error: "No pudimos registrar tu solicitud. Inténtalo de nuevo." };
  }

  revalidatePath("/membresia");
  return {
    ok: true,
    message: "Solicitud registrada. Nuestro equipo revisará tu perfil y te contactará pronto.",
  };
}

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "Ingresa un código válido.")
    .max(64, "Código demasiado largo."),
});

export async function redeemActivationCodeAction(
  _prev: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const parsed = codeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Código inválido." };
  }

  const { user, orgId } = await requireUser();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("redeem_activation_code", {
    p_org_id: orgId,
    p_user_id: user.id,
    p_code: parsed.data.code,
  });

  if (error) {
    return { error: "No se pudo validar el código en este momento." };
  }

  const row = (
    data as
      | {
          ok: boolean;
          message: string;
          new_plan: string | null;
          credits_added: number;
          balance: number;
        }[]
      | null
  )?.[0];

  if (!row?.ok) {
    return { error: row?.message ?? "El código no es válido." };
  }

  revalidatePath("/membresia");
  revalidatePath("/projects");
  revalidatePath("/", "layout");
  return {
    ok: true,
    message:
      row.credits_added > 0
        ? `${row.message} (+${row.credits_added} créditos; saldo actual: ${row.balance}).`
        : row.message,
  };
}
