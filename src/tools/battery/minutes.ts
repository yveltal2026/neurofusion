import { iatConfigSchema } from "@/tools/iat/config";
import { estimateMinutes } from "@/tools/iat/engine/protocol";
import { listItems, surveyConfigSchema } from "@/tools/survey/engine";
import type { StepTool } from "./engine/config";

/** Segundos por pregunta de encuesta (lectura + respuesta). Orientativo. */
const SECONDS_PER_SURVEY_ITEM = 12;
/** Minutos fijos del formulario inicial de un IAT (edad, género, preferencia explícita). */
const IAT_FORM_MINUTES = 1;

/** Duración estimada de un estudio, en minutos, a partir de su configuración guardada. 0 si no es válida. */
export function estimateStudyMinutes(tool: StepTool, config: unknown): number {
  if (tool === "iat") {
    const c = iatConfigSchema.safeParse(config);
    return c.success ? estimateMinutes(c.data.protocol, Math.max(1, c.data.dimensions.length)) + IAT_FORM_MINUTES : 0;
  }
  const c = surveyConfigSchema.safeParse(config);
  return c.success ? Math.max(1, Math.ceil((listItems(c.data).length * SECONDS_PER_SURVEY_ITEM) / 60)) : 0;
}
