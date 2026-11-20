# Implementation Plan: Análisis de Imagen Web (Capturas de Sitio)

**Branch**: `001-web-image-analysis` | **Date**: 2026-11-19 | **Spec**: [spec.md](file:///home/antigravity/yveltal2026/neurofusion/specs/001-web-image-analysis/spec.md)
**Input**: Feature specification from `/specs/001-web-image-analysis/spec.md`

## Summary

Separar el análisis de capturas de pantalla web en un tipo de estudio independiente (`web_visual`) dentro de la categoría enfocada a web en Proyectos (`TOOL_CATEGORIES` → `digital` / Diagnóstico digital), manteniendo `visual` exclusivamente para piezas gráficas y anuncios y conservando compatibilidad total hacia atrás con estudios `visual` existentes (incluido su modo `journey` previo). Reutiliza el almacenamiento privado (`visual_assets` + bucket `study-assets`), los cálculos deterministas de imagen/atención (`src/tools/visual/engine/*`) y el visor de atención, añadiendo un wizard, configuración Zod y prompts específicos para UX/CRO web.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) sobre Next.js 16 (App Router) y React 19  
**Primary Dependencies**: Zod, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Tailwind CSS, Anthropic/OpenAI SDK (`src/lib/ai/`)  
**Storage**: PostgreSQL (Supabase con RLS por `org_id`) y Supabase Storage (`study-assets` bucket)  
**Testing**: Vitest (`npm test`), TypeScript (`npm run typecheck`), ESLint (`npm run lint`)  
**Target Platform**: Web app SSR/Server Actions en Vercel + Node.js  
**Project Type**: Full-stack web application (Next.js App Router)  
**Performance Goals**: Creación de estudio y carga de captura < 60 s; cálculos deterministas síncronos en servidor  
**Constraints**: Cero ruptura de estudios `visual` existentes; respetar `AGENTS.md` (registro en `docs/backlog/` y compatibilidad universitaria)  
**Scale/Scope**: Nuevo `ToolType` (`web_visual`), 1 migración SQL acotada, módulo `src/tools/web-visual/`, rutas `/projects/[id]/studies/new/web-visual` y dispatch en `/studies/[id]/*`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Motores Deterministas e IA sólo sobre Agregados**: PASS — Reutiliza `src/tools/visual/engine/*` para métricas deterministas de imagen/atención y acota la IA a redactar hallazgos UX/CRO sobre la captura y métricas calculadas.
- **II. Autoridad del Servidor y Privacidad por Defecto**: PASS — Todas las operaciones pasan por Server Actions / rutas autenticadas con RLS por `org_id` sobre `studies` y `visual_assets`; no hay datos de participantes externos en este módulo.
- **III. Herramientas Modulares dentro de Proyectos**: PASS — Se registra `web_visual` en `src/tools/registry.ts` dentro de `TOOL_CATEGORIES` (`digital`) y `TOOLS`, con su configuración Zod y UI aisladas bajo `src/tools/web-visual/`.
- **IV. Trazabilidad en Backlog y Compatibilidad Universitaria**: PASS — Se contempla ficha en `docs/backlog/cambios/` e índice/matriz en la misma entrega. No modifica autenticación, registro ni roles universitarios.
- **V. Puertas de Calidad y Verificación Real**: PASS — El plan incluye pruebas unitarias en Vitest, `npm run typecheck`, `npm run lint` y migración SQL explícita.

## Project Structure

### Documentation (this feature)

```text
specs/001-web-image-analysis/
├── plan.md              # Este documento
├── research.md          # Decisiones de reutilización y compatibilidad
├── data-model.md        # Migración tool_type y esquema Zod webVisualConfigSchema
├── quickstart.md        # Guía de verificación local
└── checklists/
    └── requirements.md  # Checklist de calidad de la spec
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20261119000000_web_visual_tool.sql   # Amplía CHECK de studies.tool_type para incluir 'web_visual'

src/
├── lib/db/types.ts                      # StudyRow.tool_type incluye 'web_visual'
├── tools/
│   ├── registry.ts                      # Registra 'web_visual' en categoría 'digital' y actualiza copy de 'visual'
│   └── web-visual/
│       ├── config.ts                    # webVisualConfigSchema (device, pageType, primaryCta, mode: single|flow)
│       ├── config.test.ts               # Pruebas unitarias de validación Zod
│       ├── analysis/
│       │   └── prompt.ts                # Prompt UX/CRO especializado para capturas web
│       └── ui/
│           ├── new-study-form.tsx       # Formulario de creación en /projects/[id]/studies/new/web-visual
│           └── overview.tsx             # Vista principal del estudio web_visual (reutiliza paneles de activos/atención)
└── app/(app)/
    ├── projects/[id]/studies/new/
    │   └── web-visual/page.tsx          # Página de creación de estudio web_visual
    └── studies/[id]/
        ├── page.tsx                     # Dispatch para tool_type === 'web_visual'
        ├── actions.ts                   # Limpieza de archivos en deleteStudy también para 'web_visual'
        ├── assets/[assetId]/page.tsx    # Soporte de activos para 'web_visual'
        └── report/page.tsx              # Soporte de reporte para 'web_visual'

docs/backlog/
├── README.md                            # Índice actualizado
├── ADOPCION.md                          # Matriz actualizada
└── cambios/COG-20261119-imagen-web-separada.md
```

**Structure Decision**: Se crea el módulo dedicado `src/tools/web-visual/` reutilizando el almacenamiento (`visual_assets`), utilidades de servidor (`src/tools/visual/image.server.ts`, `actions.ts`) y componentes de visualización (`src/tools/visual/ui/attention-viewer.tsx`, `asset-panels.tsx`), evitando duplicar lógica determinista ni crear tablas redundantes.

## Complexity Tracking

> Sin violaciones a la Constitución; no se requieren justificaciones adicionales.
