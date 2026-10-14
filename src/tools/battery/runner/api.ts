import { call } from "@/tools/iat/runner/api";
import type { BatteryProgress } from "../participant";

/** Cliente HTTP del participante de una batería. Nunca lanza: devuelve un resultado tipado. */

const base = (token: string) => `/api/b/${token}`;

export type BatteryStartPayload = BatteryProgress & {
  sessionId: string;
  resumed: boolean;
};

export const batteryApi = {
  check: (token: string) => call<object>(`${base(token)}/check`),

  start: (token: string, deviceType: string) =>
    call<BatteryStartPayload>(`${base(token)}/start`, {
      method: "POST",
      body: JSON.stringify({ consent: true, device: { deviceType } }),
    }),

  progress: (token: string, sessionId: string) =>
    call<BatteryProgress>(
      `${base(token)}/progress?sessionId=${encodeURIComponent(sessionId)}`,
    ),

  complete: (token: string, sessionId: string) =>
    call<object>(`${base(token)}/complete`, {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),
};
