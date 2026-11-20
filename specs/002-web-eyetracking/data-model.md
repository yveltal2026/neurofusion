# Data Model: Eyetracking para Web (002-web-eyetracking)

## 1. Migración SQL (`supabase/migrations/20261119010000_web_eyetracking.sql`)

1. Ampliar `studies_tool_type_check` para incluir `'web_eyetracking'` y actualizar la restricción de `access_token` para exigirlo en `'web_eyetracking'`.
2. Crear tabla `public.web_eyetracking_runs`:
   - `session_id uuid primary key`
   - `study_id uuid not null references public.studies (id) on delete cascade`
   - `mode text not null check (mode in ('live_snippet', 'no_code_captures'))`
   - `validation jsonb not null` (precisión de calibración, FPS medio, calidad)
   - `step_events jsonb not null` (array de `{ stepId, startedAtMs, completedAtMs, completed, trigger }`)
   - `samples jsonb not null` (muestras normalizadas acotadas por sesión)
   - `summary jsonb not null default '{}'::jsonb` (métricas precalculadas en servidor)
   - `created_at timestamptz not null default now()`
   - FK compuesta `(session_id, study_id) references public.sessions (id, study_id) on delete cascade`
   - RLS: `select` para `authenticated` vía `is_org_member(study_org(study_id))`; escritura exclusivamente vía `service_role`.

## 2. Configuración del Estudio (`webEyetrackingConfigSchema`)

- `mode`: `'live_snippet' | 'no_code_captures'`
- `targetUrl`: URL inicial válida (`https://...`)
- `allowedOrigins`: array de orígenes permitidos (ej. `['https://ejemplo.com']`)
- `steps`: array (1..12) de:
  - `id`: string (`S1`, `S2`, ...)
  - `title`: string (1..100)
  - `instruction`: string (1..400)
  - `advanceOn`: `'manual' | 'url_match' | 'hotspot'`
  - `urlPattern`: string opcional (para `url_match`)
  - `assetId`: uuid opcional (captura de referencia en `visual_assets`, obligatoria en `no_code_captures`)
  - `hotspot`: `{ x: number; y: number; w: number; h: number }` normalizado `[0..1]` opcional (para `hotspot`)
- `calibration`: `{ points: 5 | 9; maxDurationSeconds: number }`
