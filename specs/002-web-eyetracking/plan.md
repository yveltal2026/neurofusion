# Implementation Plan: Eyetracking para Web (Sitio en Vivo y Modo Sin Código)

**Branch**: `002-web-eyetracking` | **Date**: 2026-11-19 | **Spec**: [spec.md](file:///home/antigravity/yveltal2026/neurofusion/specs/002-web-eyetracking/spec.md)
**Input**: Feature specification from `/specs/002-web-eyetracking/spec.md`

## Summary

Implementar **Eyetracking para Web** (`web_eyetracking`) como un tipo de estudio propio dentro de **Diagnóstico digital** en Proyectos, con dos modos de ejecución:
1. **Sitio en vivo (`live_snippet`, estilo RealEye):** El analista define la URL objetivo, dominios permitidos y pasos ordenados; obtiene un snippet `<script>` para insertar en el `<head>` (o GTM) del sitio destino. El participante entra por `/s/[token]`, acepta consentimiento, es redirigido con `?nf_session=...` y el snippet ejecuta la calibración/tracking en el mismo origen del sitio enviando lotes de mirada + scroll + clics + avance de pasos a `/api/s/[token]/web-eyetrack`.
2. **Modo sin código (`no_code_captures`):** Cuando no se puede instalar código en el sitio, el analista sube capturas *full-page* por paso (reutilizando `visual_assets` + `study-assets`) con *hotspots* clicables opcionales y los participantes realizan las tareas dentro del runner `/s/[token]` con scroll vertical y el pipeline de webcam de `src/lab/eyetracking/`.

En ambos modos, un motor determinista normaliza `(x, y, scrollY, viewport)` al documento de referencia, calcula métricas por paso (completitud, duración, fijaciones, TTFF) y genera mapas de calor y *gaze plots*.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) sobre Next.js 16 (App Router) y React 19  
**Primary Dependencies**: Zod, Supabase (`@supabase/ssr`, `@supabase/supabase-js`, RLS + `service_role`), `src/lab/eyetracking/` (calibración y métricas de mirada), `src/tools/visual/eye/heatmap.ts`  
**Storage**: PostgreSQL (`studies` con `tool_type = 'web_eyetracking'`, nueva tabla `web_eyetracking_runs`, `visual_assets` para capturas de referencia / modo sin código)  
**Testing**: Vitest (`npm test`), TypeScript (`npm run typecheck`), ESLint (`npm run lint`)  
**Target Platform**: Web app SSR/API Routes (Vercel/Node) + script embebible ligero (`public/embed/web-eyetrack.js` o ruta `/api/embed/web-eyetrack.js`)  
**Performance Goals**: Envío por lotes (`sendBeacon` / `fetch` cada ~1–2 s) sin bloquear el hilo principal del sitio destino; normalización y agregación determinista en servidor  
**Constraints**: Nunca almacenar video de webcam; respetar CORS estricto por dominios configurados en `live_snippet`; privacidad por defecto (sin PII, IP sólo HMAC); compatibilidad universitaria (`AGENTS.md`)  
**Scale/Scope**: Nuevo `ToolType` (`web_eyetracking`), migración SQL `web_eyetracking_runs` + `studies_tool_type_check`, módulo `src/tools/web-eyetracking/`, endpoints `/api/s/[token]/web-eyetrack/*` y script embebible

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Motores Deterministas e IA sólo sobre Agregados**: PASS — La normalización de mirada + scroll, detección de fijaciones, completitud por paso, TTFF y heatmaps viven en `src/tools/web-eyetracking/engine/` (código puro testeado).
- **II. Autoridad del Servidor y Privacidad por Defecto**: PASS — `/api/s/[token]/web-eyetrack/*` valida token de liga mágica, sesión atómica (`claim_session`), origen (`Origin` contra dominios permitidos en `live_snippet`) y límites de tamaño; nunca guarda video ni PII.
- **III. Herramientas Modulares dentro de Proyectos**: PASS — Se registra `web_eyetracking` en `src/tools/registry.ts` dentro de `TOOL_CATEGORIES` (`digital`), con configuración Zod y vistas aisladas en `src/tools/web-eyetracking/`.
- **IV. Trazabilidad en Backlog y Compatibilidad Universitaria**: PASS — Se registrará ficha en `docs/backlog/` al implementar. No altera autenticación, registro ni roles universitarios.
- **V. Puertas de Calidad y Verificación Real**: PASS — Incluye pruebas unitarias de motor/normalización, contratos de API, `typecheck`, `lint` y migración SQL.

## Project Structure

### Documentation (this feature)

```text
specs/002-web-eyetracking/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── web-eyetrack-api.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20261119010000_web_eyetracking.sql      # 'web_eyetracking' en studies + tabla web_eyetracking_runs

src/
├── lib/db/types.ts                         # StudyRow.tool_type + WebEyetrackingRunRow
├── tools/
│   ├── registry.ts                         # Registra 'web_eyetracking' en categoría 'digital'
│   └── web-eyetracking/
│       ├── config.ts                       # webEyetrackingConfigSchema (url, allowedOrigins, mode, steps, hotspots)
│       ├── config.test.ts
│       ├── engine/
│       │   ├── normalize.ts                # Normaliza (x, y, scrollX, scrollY, viewport) -> documento [0..1]
│       │   ├── metrics.ts                  # Completitud por paso, duración, fijaciones, TTFF, heatmap
│       │   └── engine.test.ts
│       ├── runner/
│       │   ├── WebEyeLiveBridge.tsx        # Flujo /s/[token] para modo live_snippet (consentimiento -> redirect)
│       │   └── WebEyeCaptureRunner.tsx     # Flujo /s/[token] para modo no_code_captures (scroll + hotspots + webcam)
│       └── ui/
│           ├── new-study-form.tsx          # Wizard: URL, modo, pasos, dominios
│           ├── overview.tsx                # Liga mágica, snippet <head> + verificador, carga de capturas
│           └── results.tsx                 # Heatmap con scroll, gaze plot y métricas por paso
├── app/
│   ├── (app)/projects/[id]/studies/new/web-eyetracking/page.tsx
│   ├── (app)/studies/[id]/page.tsx         # Dispatch para tool_type === 'web_eyetracking'
│   ├── s/[token]/page.tsx                  # Dispatch participante para web_eyetracking
│   └── api/
│       ├── embed/web-eyetrack.js/route.ts  # Sirve el script embebible ligero para <head>
│       └── s/[token]/web-eyetrack/
│           ├── session/route.ts            # GET/POST init de sesión desde el snippet (CORS validado)
│           └── events/route.ts             # POST lotes de mirada, scroll, clics y pasos (CORS validado)
```

## Complexity Tracking

> Sin violaciones a la Constitución; no se requieren justificaciones adicionales.
