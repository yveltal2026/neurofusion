import { SetupNotice } from "@/components/setup-notice";
import { ForgotPasswordForm } from "@/components/password-reset-forms";
import { isSupabaseConfigured } from "@/lib/env";

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const sp = await searchParams;
  return <ForgotPasswordForm expired={sp.error === "expired"} />;
}
