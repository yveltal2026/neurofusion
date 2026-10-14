import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";

/** Origen público de la petición (para armar ligas con el dominio desde el que se mira la página). */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : publicEnv().appUrl;
}
