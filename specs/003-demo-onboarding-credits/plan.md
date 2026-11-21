# Implementation Plan: Registro Público DEMO, Límites/Créditos, Membresía por Perfil y Onboarding Gamificado

**Branch**: `003-demo-onboarding-credits` | **Date**: 2026-11-20 | **Spec**: [spec.md](file:///home/antigravity/yveltal2026/neurofusion/specs/003-demo-onboarding-credits/spec.md)  
**Input**: Feature specification from `/specs/003-demo-onboarding-credits/spec.md`

## Summary

Habilitar la apertura pública de **Aesteros** manteniendo control estricto de costos, captura de audiencia y conversión guiada mediante cinco piezas integradas:
1. **Registro público con segmento de audiencia** en [`EntrarScreen`](file:///home/antigravity/yveltal2026/neurofusion/src/components/entrar-screen.tsx) y [`signUp`](file:///home/antigravity/yveltal2026/neurofusion/src/lib/auth/actions.ts): captura obligatoria de perfil (`researcher`, `agency_company`, `teacher`, `student`, `other`) y organización opcional, persistidos vía `handle_new_user()` con plan inicial `demo` y dotación de **30 créditos**.
2. **Motor de cuotas DEMO y ledger transaccional de créditos** (`src/lib/plans/` + migración SQL): límites estructurales DEMO (`1` proyecto, `3` estudios, `15` respuestas por estudio en `claim_session`/API) y cobro/reintegro atómico de créditos en acciones de IA y auditorías en vivo (`reserveCreditsForAction` / `refundReservedCredits`).
3. **Onboarding interactivo con tour guiado y gamificación** (`src/lib/onboarding/` + `src/components/onboarding/`): checklist no bloqueante de 4 misiones en `/projects`, botón para abrir tour guiado paso a paso accesible (`prefers-reduced-motion` + teclado) y acreditación idempotente de **+30 créditos extra** al completar misiones.
4. **Espacio de Plan y Membresía (`/membresia`)** adaptado al segmento del registro: muestra consumo vs. límites, historial de movimientos de créditos, planes/licencias diferenciadas (académico vs. comercial/investigador), solicitud de ascenso (`membership_requests`) y canje de códigos de activación (`activation_codes`).
5. **Trazabilidad en Backlog y Compatibilidad Universitaria**: ficha en `docs/backlog/` documentando el aislamiento respecto a ediciones universitarias (`COMPATIBILIDAD_UNIVERSITARIA.md`).

## Technical Context

**Language/Version**: TypeScript 5.x (strict) sobre Next.js 16 (App Router) y React 19  
**Primary Dependencies**: Zod v4, Supabase (`@supabase/ssr`, `@supabase/supabase-js`, RLS + `service_role` RPCs), Tailwind CSS v4  
**Storage**: PostgreSQL en Supabase (`profiles`, `organizations`, `credit_ledger`, `onboarding_progress`, `membership_requests`, `activation_codes`, `activation_redemptions`)  
**Testing**: Vitest (`npm test`), TypeScript (`npm run typecheck`), ESLint (`npm run lint`)  
**Target Platform**: Web app SSR / Server Actions / Route Handlers (Next.js)  
**Project Type**: Web application (full-stack Next.js + Supabase)  
**Performance Goals**: Evaluación de cuotas y saldo en una consulta ligera por request en `(app)/layout.tsx`; operaciones de crédito atómicas en una sola llamada RPC  
**Constraints**: Nunca confiar en valores de plan/créditos del cliente; reintegrar créditos si falla un proveedor IA externo; WCAG AA y soporte `prefers-reduced-motion`; preservar contrato universitario (`COMPATIBILIDAD_UNIVERSITARIA.md`)  
**Scale/Scope**: Nueva migración SQL, módulo `src/lib/plans/`, módulo `src/lib/onboarding/`, actualización de `EntrarScreen` + `signUp`, guardias en creación de proyectos/estudios/IA/participantes, badge de créditos en `AppLayout`, checklist/tour en `/projects` y nueva ruta `/membresia`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Motores Deterministas e IA sólo sobre Agregados**: PASS — Toda la lógica de cuotas por plan, costos por acción, catálogo de planes por audiencia y cálculo de progreso/misiones reside en módulos puros testeables (`src/lib/plans/quotas.ts`, `src/lib/onboarding/missions.ts`).
- **II. Autoridad del Servidor y Privacidad por Defecto**: PASS — El plan `demo`, las cuotas, el ledger de créditos (`consume_org_credits` / `grant_org_credits`), los bonos de onboarding y el tope de respuestas en `claim_session` se aplican exclusivamente en servidor y base de datos con RLS estricto por `org_id`.
- **III. Herramientas Modulares dentro de Proyectos**: PASS — La verificación de cuota/créditos se inyecta de forma transversal sin acoplar entre sí las 8 herramientas existentes.
- **IV. Trazabilidad en Backlog y Compatibilidad Universitaria**: PASS — Se creará ficha en `docs/backlog/cambios/COG-20261120-demo-onboarding-membresia.md` y se actualizarán `README.md` y `ADOPCION.md` al implementar; el flujo público DEMO no modifica ni habilita autorregistro de alumnos en ediciones universitarias.
- **V. Puertas de Calidad y Verificación Real**: PASS — El plan incluye pruebas unitarias de cuotas, misiones, componentes (`EntrarScreen`, checklist/tour, `/membresia`) y verificación de `typecheck`, `lint` y `npm test`.

## Project Structure

### Documentation (this feature)

```text
specs/003-demo-onboarding-credits/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── checklists/
│   └── requirements.md
└── contracts/
    └── demo-membership-api.md
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20261120000000_demo_onboarding_credits.sql  # Tablas, trigger actualizado, RPCs atómicos y claim_session DEMO

src/
├── lib/
│   ├── db/types.ts                             # Tipos PlanTier, AudienceSegment, CreditLedgerRow, etc.
│   ├── auth/actions.ts                         # Validación de audience_segment en signUp
│   ├── plans/
│   │   ├── quotas.ts                           # Definición pura de planes, límites DEMO, costos e info por audiencia
│   │   ├── quotas.test.ts
│   │   └── server.ts                           # getOrgBillingSummary, assertCanCreate*, reserve/refund credits
│   └── onboarding/
│       ├── missions.ts                         # Definición de 4 misiones + pasos del tour guiado
│       ├── missions.test.ts
│       └── actions.ts                          # syncOnboardingMissions, completeTourMission, dismissChecklist
├── components/
│   ├── entrar-screen.tsx                       # Selector de "¿Qué perfil te describe mejor?" + org opcional
│   ├── entrar-screen.test.tsx
│   ├── plan-credit-badge.tsx                   # Pill en AppLayout con Plan + Créditos -> /membresia
│   ├── onboarding/
│   │   ├── onboarding-checklist.tsx            # Checklist interactivo con progreso, recompensas y botón de tour
│   │   ├── guided-tour-modal.tsx               # Tour guiado paso a paso accesible (prefers-reduced-motion)
│   │   └── onboarding.test.tsx
│   └── membership/
│       ├── membership-hub.tsx                  # Catálogo dinámico según audiencia, consumo, historial, solicitudes y códigos
│       └── membership-hub.test.tsx
└── app/
    ├── (app)/
    │   ├── layout.tsx                          # Muestra PlanCreditBadge y carga resumen ligero de plan/créditos
    │   ├── projects/
    │   │   ├── page.tsx                        # Integra OnboardingChecklist + banner límite si aplica
    │   │   └── actions.ts                      # assertCanCreateProject
    │   ├── studies/[id]/
    │   │   ├── actions.ts                      # assertCanCreateStudy en duplicateStudy
    │   │   └── analysis/actions.ts             # reserveCreditsForAction + refund si falla IA
    │   └── membresia/
    │       ├── page.tsx                        # Vista Plan, Créditos y Crecimiento por perfil
    │       └── actions.ts                      # submitMembershipRequestAction, redeemActivationCodeAction
    ├── tools/                                  # Guardias assertCanCreateStudy / reserveCreditsForAction en acciones de herramientas
    └── api/s/[token]/web-eyetrack/session/     # Respetar tope DEMO de 15 respuestas en web_eyetracking
```

**Structure Decision**: Se mantiene la arquitectura App Router existente de Next.js 16 + Server Actions + Supabase RPCs sin agregar microservicios ni dependencias externas pesadas.

## Complexity Tracking

> Sin violaciones a la Constitución; la lógica de negocio de cuotas y misiones es pura/determinista y la autoridad reside en Supabase/Next.js servidor.
