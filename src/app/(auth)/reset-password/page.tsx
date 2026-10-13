import { redirect } from "next/navigation";
import { SetupNotice } from "@/components/setup-notice";
import { ResetPasswordForm } from "@/components/password-reset-forms";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  // Sólo se llega con la sesión de recuperación que abre el enlace del correo.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=expired");
  return <ResetPasswordForm />;
}
