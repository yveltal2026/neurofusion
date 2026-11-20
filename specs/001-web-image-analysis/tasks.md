# Tasks: Análisis de Imagen Web (Capturas de Sitio)

**Input**: Design documents from `/specs/001-web-image-analysis/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

## Phase 1: Setup & Foundational (Blocking Prerequisites)

**Purpose**: Habilitar el tipo de estudio `web_visual` en base de datos, tipos TypeScript y registro de herramientas.

- [x] T001 Crear migración SQL `supabase/migrations/20261119000000_web_visual_tool.sql` ampliando `studies_tool_type_check` para incluir `'web_visual'`
- [x] T002 Actualizar `StudyRow.tool_type` en `src/lib/db/types.ts` para incluir `'web_visual'`
- [x] T003 [P] Registrar `web_visual` en `src/tools/registry.ts` dentro de `TOOL_CATEGORIES` (`digital`) y actualizar la descripción de `visual` para enfocarla en piezas gráficas y anuncios
- [x] T004 [P] Crear `src/tools/web-visual/config.ts` con `webVisualConfigSchema` (`mode`, `pageType`, `deviceFocus`, `objective`, `primaryCta`, `audience`, `brand`) y sus pruebas unitarias en `src/tools/web-visual/config.test.ts`

**Checkpoint**: `web_visual` reconocido en BD, tipos, registro y validación Zod.

---

## Phase 2: User Story 1 - Crear estudio de Análisis de Imagen Web en Proyecto (Priority: P1) 🎯 MVP

**Goal**: Permitir al investigador crear un estudio `web_visual` desde `/projects/[id]/studies/new/web-visual`.

**Independent Test**: Abrir `/projects/[id]/studies/new`, seleccionar **Análisis de Imagen Web**, enviar el formulario y verificar creación de estudio con `tool_type = 'web_visual'`.

- [x] T005 [US1] Crear `src/tools/web-visual/actions.ts` con `createWebVisualStudy`, `updateWebVisualContext` y carga de estudio `loadWebVisualStudy` (permitiendo también reutilizar activos en `visual_assets`)
- [x] T006 [US1] Crear formulario `src/tools/web-visual/ui/new-study-form.tsx` y página `src/app/(app)/projects/[id]/studies/new/web-visual/page.tsx`
- [x] T007 [US1] Actualizar `src/app/(app)/studies/[id]/actions.ts` (`deleteStudy`) para limpiar archivos de Storage también cuando `tool_type === 'web_visual'`

**Checkpoint**: User Story 1 funcional e independiente.

---

## Phase 3: User Story 2 - Subir capturas de pantalla del sitio (Priority: P1)

**Goal**: Permitir subir, etiquetar (Desktop / Mobile / Web y correo), ordenar y eliminar capturas del sitio web en `visual_assets`.

**Independent Test**: Subir capturas PNG/JPG/WebP al estudio `web_visual`, verificar guardado en `visual_assets` y previsualización ordenada.

- [x] T008 [US2] Habilitar carga, orden y eliminación de capturas en `src/tools/web-visual/ui/overview.tsx` reutilizando `src/tools/visual/actions.ts` / `asset-panels.tsx` y `uploadVisualAsset` compatible con `web_visual`
- [x] T009 [US2] Actualizar `src/app/(app)/studies/[id]/assets/[assetId]/page.tsx` para aceptar estudios `web_visual`

**Checkpoint**: User Story 2 funcional e independiente.

---

## Phase 4: User Story 3 - Análisis UX/CRO y reporte web (Priority: P2)

**Goal**: Ejecutar análisis determinista + IA UX/CRO sobre capturas web y mostrar resultados y reporte.

**Independent Test**: Ejecutar análisis sobre una captura web cargada y verificar vista de resultados y `/studies/[id]/report`.

- [x] T010 [P] [US3] Crear `src/tools/web-visual/analysis/prompt.ts` con prompt UX/CRO especializado para capturas web (CTA, *above-the-fold*, jerarquía, fricción) y prueba unitaria en `src/tools/web-visual/analysis/prompt.test.ts`
- [x] T011 [US3] Integrar ejecución de análisis (`analyzeVisualAsset` / `web_visual`) y despacho en `src/app/(app)/studies/[id]/page.tsx` y `src/app/(app)/studies/[id]/report/page.tsx`

**Checkpoint**: Todas las User Stories funcionales y compatibles con estudios `visual` previos.

---

## Phase 5: Backlog, Verificación y Cierre

**Purpose**: Cumplir `AGENTS.md` (Constitución IV y V) y validar puertas de calidad.

- [x] T012 [P] Crear ficha `docs/backlog/cambios/COG-20261119-imagen-web-separada.md` y actualizar `docs/backlog/README.md` y `docs/backlog/ADOPCION.md`
- [x] T013 Ejecutar `npm run typecheck`, `npm run lint` y `npm test` y verificar 100 % verde
