import { AiError, type AnalysisProvider, type CompletionRequest, type CompletionResult } from "./types";

/** Un nivel de la cascada: un proveedor concreto (clave + modelo) con una etiqueta legible. */
export interface Tier {
  id: string;
  label: string;
  provider: AnalysisProvider;
}

export interface CascadeOptions {
  /** Tope de espera por nivel (excepto el último). Evita que un nivel lento consuma toda la función. */
  perTierTimeoutMs?: number;
  /** Presupuesto total de la cascada; debe quedar por debajo del maxDuration de la ruta (120 s). */
  totalBudgetMs?: number;
  now?: () => number;
  /** Niveles en pausa (id → timestamp). Por defecto compartido por instancia del servidor. */
  cooldowns?: Map<string, number>;
  log?: (message: string) => void;
}

const DEFAULT_PER_TIER_MS = 45_000;
const DEFAULT_TOTAL_MS = 110_000;
/** Tiempo mínimo que se le reserva al último nivel, y piso del tope de los anteriores. */
const MIN_SLICE_MS = 15_000;

/**
 * Tras agotar la cuota o fallar la clave, ese nivel se salta un rato para no gastar una
 * llamada (y latencia) en cada petición. Los errores transitorios no pausan el nivel.
 */
const COOLDOWN_MS: Partial<Record<AiError["kind"], number>> = { rate_limit: 60_000, auth: 600_000 };

const sharedCooldowns = new Map<string, number>();

function asAiError(e: unknown): AiError {
  return e instanceof AiError ? e : new AiError("No se pudo conectar con el proveedor de IA.", "provider");
}

/**
 * Proveedor que recorre los niveles EN ORDEN y devuelve la primera respuesta que llegue.
 * Pasa al siguiente nivel ante cualquier fallo del proveedor (cuota, clave, error, tiempo de
 * espera, respuesta truncada o rechazo). Un error de configuración se propaga de inmediato.
 * `name` y `model` reflejan el nivel que respondió por última vez, para guardarlos junto al análisis.
 */
export function createCascadeProvider(tiers: Tier[], opts: CascadeOptions = {}): AnalysisProvider {
  if (tiers.length === 0) throw new AiError("No hay ningún proveedor de IA configurado.", "config");
  const now = opts.now ?? Date.now;
  const cooldowns = opts.cooldowns ?? sharedCooldowns;
  const log = opts.log ?? ((m: string) => console.warn(m));
  const perTier = opts.perTierTimeoutMs ?? DEFAULT_PER_TIER_MS;
  const total = opts.totalBudgetMs ?? DEFAULT_TOTAL_MS;
  let current = tiers[0].provider;

  return {
    get name() {
      return current.name;
    },
    get model() {
      return current.model;
    },
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const start = now();
      const available = tiers.filter((t) => (cooldowns.get(t.id) ?? 0) <= start);
      // Si todos están en pausa, se intentan igual (mejor un intento que un error seguro).
      const order = available.length > 0 ? available : tiers;
      const failures: AiError[] = [];

      for (let i = 0; i < order.length; i++) {
        const tier = order[i];
        const isLast = i === order.length - 1;
        const remaining = total - (now() - start);
        const timeoutMs = isLast ? Math.max(remaining, MIN_SLICE_MS) : Math.min(perTier, Math.max(remaining - MIN_SLICE_MS, MIN_SLICE_MS));
        const timeout = AbortSignal.timeout(timeoutMs);
        const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;

        try {
          const res = await tier.provider.complete({ ...req, signal });
          current = tier.provider;
          if (failures.length > 0) log(`[ai] respondió ${tier.label} tras ${failures.length} nivel(es) fallido(s)`);
          return res;
        } catch (e) {
          const err = asAiError(e);
          if (err.kind === "config") throw err;
          failures.push(err);
          const pause = COOLDOWN_MS[err.kind];
          if (pause) cooldowns.set(tier.id, now() + pause);
          log(`[ai] ${tier.label} falló (${err.kind}); ${isLast ? "sin más niveles" : "probando el siguiente"}`);
        }
      }

      const last = failures[failures.length - 1];
      const allRateLimited = failures.every((f) => f.kind === "rate_limit");
      const suffix = order.length > 1 ? ` Se intentaron ${order.length} proveedores de IA.` : "";
      throw new AiError(`${last.message}${suffix}`, allRateLimited ? "rate_limit" : last.kind);
    },
  };
}
