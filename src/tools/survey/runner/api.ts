import { call } from "@/tools/iat/runner/api";
import type { DeviceInfo } from "@/tools/iat/runner/device";

/** Cliente HTTP del participante de una encuesta. Nunca lanza: devuelve un resultado tipado. */

const base = (token: string) => `/api/s/${token}/survey`;

export const surveyApi = {
  check: (token: string) => call<object>(`${base(token)}/check`),

  start: (token: string, device: DeviceInfo) =>
    call<{ sessionId: string }>(`${base(token)}/start`, {
      method: "POST",
      body: JSON.stringify({ consent: true, device }),
    }),

  submit: (
    token: string,
    sessionId: string,
    answers: Record<string, unknown>,
  ) =>
    call<object>(`${base(token)}/submit`, {
      method: "POST",
      body: JSON.stringify({ sessionId, answers }),
    }),
};
