import type { CounterbalanceEntry, SubmittedTrial } from "../session";
import type { DeviceInfo } from "./device";

/** Cliente HTTP del participante. Todas las funciones devuelven un resultado tipado, nunca lanzan. */

export type ApiFailure = { ok: false; code: string; message: string; retryable: boolean };

const FALLBACK: ApiFailure = {
  ok: false,
  code: "network",
  message: "No pudimos conectar con el servidor. Revisa tu conexión.",
  retryable: true,
};

async function call<T extends object>(url: string, init?: RequestInit): Promise<({ ok: true } & T) | ApiFailure> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    let json: Record<string, unknown> | null = null;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      /* respuesta sin JSON */
    }
    if (res.ok && json?.ok) return json as { ok: true } & T;
    return {
      ok: false,
      code: String(json?.code ?? `http_${res.status}`),
      message: String(json?.message ?? "Ocurrió un error. Inténtalo de nuevo."),
      // Errores del servidor / red se pueden reintentar; los de validación o estado, no.
      retryable: res.status >= 500 || res.status === 429,
    };
  } catch {
    return FALLBACK;
  }
}

const base = (token: string) => `/api/s/${token}`;

export const participantApi = {
  check: (token: string) => call<object>(`${base(token)}/check`),

  start: (token: string, participant: unknown, device: DeviceInfo) =>
    call<{ sessionId: string; counterbalance: CounterbalanceEntry[] }>(`${base(token)}/start`, {
      method: "POST",
      body: JSON.stringify({ participant, consent: true, device }),
    }),

  sendTrials: (token: string, sessionId: string, dimensionIdx: number, trials: SubmittedTrial[]) =>
    call<{ stored: number }>(`${base(token)}/trials`, {
      method: "POST",
      body: JSON.stringify({ sessionId, dimensionIdx, trials }),
    }),

  complete: (token: string, sessionId: string) =>
    call<object>(`${base(token)}/complete`, { method: "POST", body: JSON.stringify({ sessionId }) }),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reintenta con backoff exponencial sólo los fallos reintentables. */
export async function withRetry<T extends { ok: boolean }>(
  fn: () => Promise<T | ApiFailure>,
  { retries = 4, baseDelayMs = 1000 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T | ApiFailure> {
  let result = await fn();
  for (let attempt = 0; attempt < retries && !result.ok && (result as ApiFailure).retryable; attempt++) {
    await sleep(baseDelayMs * 2 ** attempt);
    result = await fn();
  }
  return result;
}
