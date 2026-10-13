import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Intercambia el `code` de OAuth / confirmación de correo por una sesión. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/projects";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/projects";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  // Un enlace de restablecimiento vencido o ya usado se resuelve pidiendo otro, no con un error de login.
  if (next.startsWith("/reset-password")) return NextResponse.redirect(`${origin}/forgot-password?error=expired`);
  return NextResponse.redirect(`${origin}/login?error=callback`);
}
