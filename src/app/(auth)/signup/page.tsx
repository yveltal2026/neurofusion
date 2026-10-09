import { AuthForm } from "@/components/auth-form";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export default function SignupPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  return <AuthForm mode="signup" />;
}
