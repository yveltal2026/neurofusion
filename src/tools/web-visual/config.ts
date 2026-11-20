import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

export const WEB_PAGE_TYPES = [
  "landing",
  "product",
  "pricing",
  "checkout",
  "dashboard",
  "other",
] as const;

export type WebPageType = (typeof WEB_PAGE_TYPES)[number];

export const WEB_PAGE_TYPE_LABEL: Record<WebPageType, string> = {
  landing: "Landing / Inicio",
  product: "Página de producto o servicio",
  pricing: "Precios / Planes",
  checkout: "Checkout / Registro",
  dashboard: "Aplicación / Dashboard",
  other: "Otra vista web",
};

export const WEB_DEVICE_FOCUS = ["desktop", "mobile", "both"] as const;
export type WebDeviceFocus = (typeof WEB_DEVICE_FOCUS)[number];

export const WEB_DEVICE_FOCUS_LABEL: Record<WebDeviceFocus, string> = {
  desktop: "Escritorio (Desktop)",
  mobile: "Móvil (Mobile)",
  both: "Escritorio y Móvil",
};

export const webVisualConfigSchema = z.object({
  mode: z.enum(["single", "flow"]).default("single"),
  pageType: z.enum(WEB_PAGE_TYPES).default("landing"),
  deviceFocus: z.enum(WEB_DEVICE_FOCUS).default("desktop"),
  objective: text(600).min(1, "Describe el objetivo principal de la página"),
  primaryCta: text(160).default(""),
  brand: text(120).default(""),
  audience: text(400).default(""),
});

export type WebVisualConfig = z.infer<typeof webVisualConfigSchema>;
