/**
 * Calibración del panel modelado (cuotas en %). Origen: cuotas de NeuroSEO cal-2026.1
 * (80 perfiles; fuentes declaradas INEGI ENDUTIH 2025 y AMVO 2026; los datos crudos no
 * acompañan al módulo). Sólo la edad y la alfabetización digital influyen en el modelo:
 * género, NSE, ciudad u ocupación eran descriptivos y se omiten a propósito.
 */
export const AGE_GROUPS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const LITERACY = ["Alta", "Media", "Baja"] as const;
export type Literacy = (typeof LITERACY)[number];

export interface Quotas {
  age: Record<AgeGroup, number>;
  literacy: Record<Literacy, number>;
}

export const DEFAULT_CALIBRATION = "cal-mx-2026.1";

export const DEFAULT_QUOTAS: Quotas = {
  age: { "18-24": 13.75, "25-34": 26.25, "35-44": 23.75, "45-54": 17.5, "55-64": 12.5, "65+": 6.25 },
  literacy: { Alta: 31.25, Media: 43.75, Baja: 25 },
};
