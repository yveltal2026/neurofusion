import { call } from "@/tools/iat/runner/api";
import type { StepStatus } from "../server";

/** Cliente HTTP del participante de una batería. Nunca lanza: devuelve un resultado tipado. */

const base = (token: string) => `/api/b/${token}`;

export interface ProgressPayload {
  batterySessionId: string;
  sessionStatus: "started" | "completed" | "abandoned";
  steps: { studyId: string; status: StepStatus }[];
  nextIndex: number | null;
}

export const batteryApi = {
  start: (token: string, deviceType: "desktop" | "mobile" | "tablet" | "unknown") =>
    call<{ batterySessionId: string }>(`${base(token)}/start`, {
      method: "POST",
      body: JSON.stringify({ consent: true, device: { deviceType } }),
    }),

  progress: (token: string) => call<ProgressPayload>(`${base(token)}/progress`),

  complete: (token: string) => call<object>(`${base(token)}/complete`, { method: "POST", body: "{}" }),
};
