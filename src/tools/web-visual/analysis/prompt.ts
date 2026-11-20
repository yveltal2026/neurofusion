import {
  WEB_DEVICE_FOCUS_LABEL,
  WEB_PAGE_TYPE_LABEL,
  type WebVisualConfig,
} from "../config";

/**
 * Construye el contexto UX/CRO especializado para evaluar capturas de pantalla web
 * sobre el motor de visión estructurada.
 */
export function buildWebVisualContextText(
  config: WebVisualConfig,
  assetTitle: string,
  placementLabel: string | null,
): string {
  const lines = [
    `CONTEXTO WEB UX/CRO:`,
    `- Tipo de vista: ${WEB_PAGE_TYPE_LABEL[config.pageType]}`,
    `- Modo de evaluación: ${config.mode === "flow" ? "Flujo de pantallas web" : "Captura individual"}`,
    `- Dispositivo objetivo: ${WEB_DEVICE_FOCUS_LABEL[config.deviceFocus]}`,
    `- Objetivo principal de la página: ${config.objective}`,
  ];
  if (config.primaryCta) {
    lines.push(`- CTA / acción principal esperada: ${config.primaryCta}`);
  }
  if (config.brand) {
    lines.push(`- Marca o sitio: ${config.brand}`);
  }
  if (config.audience) {
    lines.push(`- Público objetivo: ${config.audience}`);
  }
  lines.push(`- Captura evaluada: ${assetTitle}`);
  if (placementLabel) {
    lines.push(`- Formato declarado: ${placementLabel}`);
  }
  lines.push(
    `Prioriza en los hallazgos: visibilidad above-the-fold, jerarquía tipográfica, prominencia del CTA principal, carga cognitiva y zonas ciegas en interfaz web.`,
  );
  return lines.join("\n");
}
