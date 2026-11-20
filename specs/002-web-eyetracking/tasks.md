# Tasks: Eyetracking para Web (Sitio en Vivo y Modo Sin Código)

**Input**: Design documents from `/specs/002-web-eyetracking/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/web-eyetrack-api.md

## Phase 1: Setup & Foundational

- [ ] T001 Crear migración SQL `supabase/migrations/20261119010000_web_eyetracking.sql` (`'web_eyetracking'` en `studies` + tabla `web_eyetracking_runs` con RLS)
- [ ] T002 Actualizar `StudyRow.tool_type` y añadir `WebEyetrackingRunRow` en `src/lib/db/types.ts`
- [ ] T003 [P] Registrar `web_eyetracking` en `src/tools/registry.ts` (categoría `digital`) y en `src/app/(app)/projects/[id]/studies/new/page.tsx` (`ILLUSTRATIONS`)
- [ ] T004 [P] Crear `src/tools/web-eyetracking/config.ts` (`webEyetrackingConfigSchema`) y `src/tools/web-eyetracking/config.test.ts`

## Phase 2: Motor Determinista (Normalización con Scroll y Métricas)

- [ ] T005 [P] Crear `src/tools/web-eyetracking/engine/normalize.ts` (proyección viewport + `scrollX`/`scrollY` → coordenadas normalizadas de documento `[0..1]`)
- [ ] T006 [P] Crear `src/tools/web-eyetracking/engine/metrics.ts` (completitud por paso, duración media, fijaciones y celdas de heatmap)
- [ ] T007 Crear pruebas unitarias en `src/tools/web-eyetracking/engine/engine.test.ts`

## Phase 3: US1 - Configuración y Alta del Estudio

- [ ] T008 [US1] Crear `src/tools/web-eyetracking/actions.ts` (`createWebEyetrackingStudy`, `updateWebEyetrackingSteps`)
- [ ] T009 [US1] Crear `src/tools/web-eyetracking/ui/new-study-form.tsx` y `src/app/(app)/projects/[id]/studies/new/web-eyetracking/page.tsx`
- [ ] T010 [US1] Crear `src/tools/web-eyetracking/ui/overview.tsx` (liga mágica, snippet `<head>`, verificador de dominio y carga de capturas) y despachar en `src/app/(app)/studies/[id]/page.tsx`

## Phase 4: US2 & US3 - Endpoints Participante, Snippet Embebible y Runner Sin Código

- [ ] T011 [US2] Crear utilidades de CORS/origen y token en `src/tools/web-eyetracking/server.ts`
- [ ] T012 [US2] Crear `src/app/api/s/[token]/web-eyetrack/session/route.ts` y `events/route.ts`
- [ ] T013 [US2] Crear `src/app/api/embed/web-eyetrack.js/route.ts` (script ligero para `<head>` con barra flotante de pasos y envío por lotes)
- [ ] T014 [US2] [US3] Crear `src/tools/web-eyetracking/runner/WebEyeLiveBridge.tsx` y `WebEyeCaptureRunner.tsx` y conectar en `src/app/s/[token]/page.tsx`

## Phase 5: US4 - Resultados, Backlog y Verificación

- [ ] T015 [US4] Crear `src/tools/web-eyetracking/ui/results.tsx` y conectar vista de resultados para `web_eyetracking`
- [ ] T016 Crear ficha `docs/backlog/cambios/COG-20261119-eyetracking-web.md` y actualizar `docs/backlog/README.md` y `docs/backlog/ADOPCION.md`
- [ ] T017 Ejecutar `npm run typecheck`, `npm run lint` y `npm test` (100 % verde)
