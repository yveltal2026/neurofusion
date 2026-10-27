import { z } from "zod";
import { piecesConfigSchema } from "@/tools/visual/config";

export const eyeStudyConfigSchema = piecesConfigSchema.extend({
  eyeTracking: z.object({ durationSeconds: z.number().int().min(5).max(30) }),
});

export const createEyeStudySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1, "Escribe un nombre para el estudio").max(160),
  config: eyeStudyConfigSchema,
});
