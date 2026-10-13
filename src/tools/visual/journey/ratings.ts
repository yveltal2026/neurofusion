import type { FrictionRatingRow } from "@/lib/db/types";
import type { JourneyConfig } from "../config";
import { FRICTION_KEYS, type SiteRatings } from "./model";
import { rubricItems } from "./rubric";

/** Claves de la rúbrica que aún no tienen calificación para el sitio. */
export function missingRatings(cfg: Pick<JourneyConfig, "tasks">, rows: Pick<FrictionRatingRow, "site_key" | "item_key">[], site: string): string[] {
  const have = new Set(rows.filter((r) => r.site_key === site).map((r) => r.item_key));
  return rubricItems(cfg.tasks)
    .map((i) => i.key)
    .filter((k) => !have.has(k));
}

/** Calificaciones guardadas → entrada del modelo. Supone que no falta ninguna. */
export function buildRatings(cfg: Pick<JourneyConfig, "tasks">, rows: Pick<FrictionRatingRow, "site_key" | "item_key" | "value">[], site: string): SiteRatings {
  const v = new Map(rows.filter((r) => r.site_key === site).map((r) => [r.item_key, Number(r.value)]));
  return {
    frictions: Object.fromEntries(FRICTION_KEYS.map((k) => [k, v.get(k) ?? 0])) as SiteRatings["frictions"],
    baseSuccess: Object.fromEntries(cfg.tasks.map((t) => [t.id, v.get(`base_exito.${t.id}`) ?? 0.5])),
  };
}
