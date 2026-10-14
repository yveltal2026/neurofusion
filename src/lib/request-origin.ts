import "server-only";
import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";

/** Origen público de la petición actual (para armar la liga mágica); cae a NEXT_PUBLIC_APP_URL si no hay host. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : publicEnv().appUrl;
}
