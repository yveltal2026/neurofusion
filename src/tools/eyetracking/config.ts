import { z } from "zod";
import {
  eyeTrackingConfigSchema,
  isEyeFacialCodingEnabled,
  piecesConfigSchema,
  resolveEyeMediaType,
} from "@/tools/visual/config";

export { isEyeFacialCodingEnabled, resolveEyeMediaType };

export const eyeStudyConfigSchema = piecesConfigSchema.extend({
  eyeTracking: eyeTrackingConfigSchema,
});

export const createEyeStudySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1, "Escribe un nombre para el estudio").max(160),
  config: eyeStudyConfigSchema,
});
