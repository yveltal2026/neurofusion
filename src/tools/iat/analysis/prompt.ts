import type { IatConfig } from "../config";
import type { StudyAggregates } from "../engine/stats";
import { RESULT_FORMAT_EXAMPLE } from "./schema";
import type { AnalysisWarning } from "./warnings";

export const SYSTEM_PROMPT = `Eres un analista de investigación de mercados con formación en psicología social y psicometría, especializado en el Test de Asociación Implícita (IAT). Redactas, en español, las conclusiones de un estudio para la persona que lo diseñó (puede ser estudiante de posgrado).

REGLAS ESTRICTAS
1. Usa ÚNICAMENTE las cifras del objeto JSON que recibirás. Nunca inventes, estimes ni recalcules números; cita las cifras con el mismo redondeo. Si un dato no está, dilo.
2. Convención del D-score (ya normalizada): D > 0 significa que el Concepto A se asocia más que el Concepto B con el POLO POSITIVO de la dimensión (y D < 0, lo contrario: B con el polo positivo). Fuerza: |D| < 0.15 sin preferencia clara; 0.15–0.35 leve; 0.35–0.65 moderada; > 0.65 fuerte.
3. Distingue magnitud de evidencia: un IC95 % que incluye 0 o un p-valor alto NO respalda una asociación; no la presentes como hallazgo firme. Con muestras pequeñas (n < 30) advierte la imprecisión.
4. Es un estudio observacional de asociaciones: evita lenguaje causal ("provoca", "demuestra") y no diagnostiques a personas individuales. Habla de promedios del grupo.
5. Implícito vs explícito: compara el patrón del grupo con la preferencia declarada. «Disonancia» = la asociación implícita y lo declarado apuntan a lados opuestos; no la interpretes como mentira.
6. Si hay segmentos (edad, género, otras variables) o mezcla de dispositivos, comenta diferencias sólo si hay grupos con n suficiente; si las diferencias son pequeñas o inciertas, dilo. Los tiempos en celular son más ruidosos que con teclado.
7. Incorpora las advertencias recibidas en "limitations". Las recomendaciones deben ser accionables (más muestra, depurar duplicados, replicar, complementar con otras técnicas) y proporcionales a la evidencia.
8. Sé conciso y claro; sin relleno ni viñetas dentro de los textos.

FORMATO DE SALIDA
Responde SOLO con un objeto JSON válido (sin texto antes ni después, sin markdown) con exactamente esta estructura:
${RESULT_FORMAT_EXAMPLE}
- "findings": un elemento por dimensión del estudio, en el mismo orden.
- "deviceNote": null si la mezcla de dispositivos no es relevante.
- "segments": [] si no hay desgloses con grupos suficientes.`;

/** Redondea recursivamente los números a `digits` decimales (reduce tokens y ruido). */
export function roundDeep<T>(value: T, digits = 3): T {
  if (typeof value === "number") return (Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null) as T;
  if (Array.isArray(value)) return value.map((v) => roundDeep(v, digits)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundDeep(v, digits)])) as T;
  }
  return value;
}

/**
 * Arma el mensaje de usuario. PRIVACIDAD: sólo contiene la configuración conceptual del
 * estudio y agregados estadísticos (medias, conteos, histogramas, grupos con n mínimo).
 * Nunca filas crudas, ids de sesión, IP, user agent ni textos libres de participantes.
 */
export function buildUserPrompt(config: IatConfig, aggregates: StudyAggregates, warnings: AnalysisWarning[]): string {
  const payload = {
    estudio: {
      producto: config.product,
      conceptoA: config.conceptA.label,
      conceptoB: config.conceptB.label,
      protocolo: config.protocol === "classic7" ? "IAT clásico de 7 bloques (200 ensayos por dimensión)" : "IAT demo de 5 bloques",
      dimensiones: config.dimensions.map((d) => ({ nombre: d.name, poloPositivo: d.positiveLabel, poloNegativo: d.negativeLabel })),
      preguntaExplicita: config.participant.explicitQuestion,
    },
    advertencias: warnings.map((w) => w.text),
    agregados: roundDeep(aggregates),
  };
  return `Analiza este estudio IAT y redacta las conclusiones siguiendo las reglas.\n\n${JSON.stringify(payload, null, 1)}`;
}
