import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Sin Supabase configurado dejamos pasar; las páginas muestran el aviso de configuración.
  if (!isSupabaseConfigured()) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  // Se excluyen estáticos y las rutas PÚBLICAS del participante (/s/* y /api/s/*):
  // ahí no hay sesión de investigador y no deben pasar por la lógica de auth.
  // También el laboratorio de eye tracking (/lab/*, spike) y los pesos del modelo que su librería
  // pide a /web/*: sin esta exclusión el worker recibiría el HTML del login en vez de model.json.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|s/|api/s/|lab/|web/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
