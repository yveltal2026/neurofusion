# Tasks: Registro Público DEMO, Límites/Créditos, Membresía por Perfil y Onboarding Gamificado

**Input**: Design documents from `/specs/003-demo-onboarding-credits/`  
**Prerequisites**: [plan.md](file:///home/antigravity/yveltal2026/neurofusion/specs/003-demo-onboarding-credits/plan.md), [spec.md](file:///home/antigravity/yveltal2026/neurofusion/specs/003-demo-onboarding-credits/spec.md), [research.md](file:///home/antigravity/yveltal2026/neurofusion/specs/003-demo-onboarding-credits/research.md), [data-model.md](file:///home/antigravity/yveltal2026/neurofusion/specs/003-demo-onboarding-credits/data-model.md), [demo-membership-api.md](file:///home/antigravity/yveltal2026/neurofusion/specs/003-demo-onboarding-credits/contracts/demo-membership-api.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps task to User Story (`[US1]`, `[US2]`, `[US3]`, `[US4]`, `[US5]`)

---

## Phase 1: Setup & Backlog Registration

**Purpose**: Registrar la ficha de cambio en el backlog de Aesteros y preparar la estructura modular.

- [x] T001 Crear ficha `docs/backlog/cambios/COG-20261120-demo-onboarding-membresia.md` desde `docs/backlog/PLANTILLA.md` (estado `en curso`, incluyendo compatibilidad universitaria de `docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md`)
- [x] T002 [P] Añadir fila del cambio al índice `docs/backlog/README.md` y fila correspondiente en `docs/backlog/ADOPCION.md`

---

## Phase 2: Foundational (Schema, RPCs, Types & Pure Rules)

**Purpose**: Infraestructura de base de datos, tipos y reglas deterministas compartidas que bloquean las historias de usuario.

**⚠️ CRITICAL**: Completar esta fase antes de iniciar las historias de usuario.

- [x] T003 Crear migración SQL `supabase/migrations/20261120000000_demo_onboarding_credits.sql` definiendo columnas y restricciones según `data-model.md` para `profiles.audience_segment`, `profiles.declared_organization`, `profiles.audience_other_detail`, `organizations.plan_tier`, `organizations.plan_updated_at`, nuevas tablas `credit_ledger` (`credit_ledger.delta`, `credit_ledger.event_type`, `credit_ledger.description`, `credit_ledger.idempotency_key`), `onboarding_progress` (`onboarding_progress.completed_missions`), `membership_requests` (`membership_requests.audience_segment`, `membership_requests.requested_plan`, `membership_requests.organization_name`, `membership_requests.institutional_email`, `membership_requests.notes`, `membership_requests.status`), `activation_codes` y `activation_redemptions`, backfill seguro para organizaciones existentes, RLS estricta, RPCs `get_org_credit_balance`, `consume_org_credits`, `grant_org_credits`, `redeem_activation_code`, actualización de `handle_new_user()` (asignando siempre `plan_tier = 'demo'` y `+30` créditos iniciales) y tope DEMO (`15`) en `claim_session`
- [x] T004 [P] Actualizar tipos TypeScript en `src/lib/db/types.ts` añadiendo `AudienceSegment`, `PlanTier`, `ProfileRow`, `OrganizationRow`, `CreditLedgerRow`, `OnboardingProgressRow` y `MembershipRequestRow` alineados con `data-model.md`
- [x] T005 [P] Crear módulo puro de planes, cuotas DEMO, costos de crédito y catálogo por segmento en `src/lib/plans/quotas.ts` y pruebas unitarias en `src/lib/plans/quotas.test.ts`
- [x] T006 [P] Crear módulo puro de definición de misiones de onboarding (4 misiones, +30 créditos totales) y pasos del tour guiado en `src/lib/onboarding/missions.ts` y pruebas unitarias en `src/lib/onboarding/missions.test.ts`

**Checkpoint**: Base de datos, reglas puras de cuotas y misiones probadas y listas.

---

## Phase 3: User Story 1 - Registro público con perfil de audiencia y activación DEMO (Priority: P1) 🎯 MVP

**Goal**: Preguntar al usuario qué perfil representa al registrarse en `/entrar`, guardar el segmento en `profiles` y crear su espacio en plan `DEMO` con 30 créditos iniciales sin permitir escalado desde el cliente.

**Independent Test**: Probar el formulario de registro en `/entrar` validando obligatoriedad del segmento de audiencia, y verificar con pruebas de acción `signUp` que el segmento viaja validado a Supabase Auth sin permitir enviar `plan_tier` o saldo arbitrario.

### Implementation for User Story 1

- [x] T007 [US1] Actualizar [`EntrarScreen`](file:///home/antigravity/yveltal2026/neurofusion/src/components/entrar-screen.tsx) para añadir el selector obligatorio de segmento de audiencia (`profiles.audience_segment` de `data-model.md`), campo condicional de detalle (`profiles.audience_other_detail`) cuando elige `other`, y campo opcional de organización/institución (`profiles.declared_organization`)
- [x] T008 [US1] Actualizar [`signUp`](file:///home/antigravity/yveltal2026/neurofusion/src/lib/auth/actions.ts) para validar con Zod `audience_segment`, `declared_organization` y `audience_other_detail` según `data-model.md` y enviarlos en `options.data` ignorando cualquier campo de plan/créditos enviado por el cliente
- [x] T009 [P] [US1] Actualizar pruebas de componente en `src/components/entrar-screen.test.tsx` cubriendo validación de audiencia obligatoria, selección de segmentos y envío de metadatos al registro

**Checkpoint**: Un usuario nuevo puede registrarse seleccionando su audiencia y arranca en modo `DEMO`.

---

## Phase 4: User Story 2 - Límites DEMO y consumo/reintegro atómico de créditos (Priority: P1)

**Goal**: Aplicar en servidor los límites estructurales DEMO (1 proyecto, 3 estudios, 15 respuestas/estudio) y el cobro/reintegro atómico de créditos en acciones con IA y auditorías, mostrando el saldo y plan en la barra superior.

**Independent Test**: Verificar en pruebas unitarias/acciones que el plan DEMO bloquea el 2.º proyecto, el 4.º estudio, la 16.ª respuesta en `web_eyetracking`/participantes y las acciones de IA sin saldo, y reintegra créditos ante fallos de proveedor.

### Implementation for User Story 2

- [x] T010 [US2] Crear capa de servidor `src/lib/plans/server.ts` con `getOrgBillingSummary`, `assertCanCreateProject`, `assertCanCreateStudy`, `reserveCreditsForAction` y `refundReservedCredits` sobre los RPCs de `credit_ledger` (`data-model.md`)
- [x] T011 [P] [US2] Crear componente accesible `src/components/plan-credit-badge.tsx` mostrando plan actual y saldo de créditos con enlace directo a `/membresia`, e integrarlo en `src/app/(app)/layout.tsx`
- [x] T012 [US2] Aplicar `assertCanCreateProject` en `src/app/(app)/projects/actions.ts` y mostrar estado/aviso informativo de límite DEMO en `src/app/(app)/projects/page.tsx`
- [x] T013 [US2] Aplicar `assertCanCreateStudy` en `src/app/(app)/studies/[id]/actions.ts` (`duplicateStudy`) y en las acciones de creación de estudios de `src/tools/{iat/wizard,variants/wizard,survey/builder,seo,visual,web-visual,eyetracking,web-eyetracking}/actions.ts`
- [x] T014 [US2] Integrar `reserveCreditsForAction` y `refundReservedCredits` en acciones con costo de IA/crawl: `src/app/(app)/studies/[id]/analysis/actions.ts`, `src/tools/reports/actions.ts`, `src/tools/seo/actions.ts`, `src/tools/visual/actions.ts` y `src/tools/iat/wizard/ai-suggest.ts`
- [x] T015 [US2] Respetar el tope de 15 respuestas en DEMO dentro de `src/app/api/s/[token]/web-eyetrack/session/route.ts` y `src/tools/battery/participant.ts` (alineado con `claim_session` de T003)
- [x] T016 [P] [US2] Agregar pruebas unitarias en `src/lib/plans/server.test.ts` cubriendo bloqueos por límite DEMO, descuento atómico y reintegro tras fallo de proveedor IA

**Checkpoint**: Los costos de cómputo/IA y topes DEMO están protegidos en servidor y visibles en toda la interfaz.

---

## Phase 5: User Story 3 - Onboarding interactivo con opción de tour guiado y gamificación (Priority: P2)

**Goal**: Mostrar un checklist interactivo de bienvenida en `/projects` con progreso visual, botón opcional para iniciar un tour guiado paso a paso y recompensa idempotente de +30 créditos extra al completar misiones.

**Independent Test**: Iniciar sesión como usuario nuevo, verificar el checklist (misiones verificadas en BD), abrir y finalizar el tour guiado opcional y validar que el saldo sube de forma única e idempotente.

### Implementation for User Story 3

- [x] T017 [US3] Crear acciones de servidor en `src/lib/onboarding/actions.ts` (`getOrSyncOnboardingState`, `completeTourMissionAction`, `dismissOnboardingChecklistAction`) que validan misiones reales (`projects`, `studies`) y acreditan recompensas idempotentes vía `grant_org_credits` citando `onboarding_progress.completed_missions` y `credit_ledger.idempotency_key` (`data-model.md`)
- [x] T018 [P] [US3] Crear componente `src/components/onboarding/guided-tour-modal.tsx` (tour interactivo paso a paso con navegación por teclado, cierre libre y respeto a `prefers-reduced-motion`)
- [x] T019 [US3] Crear componente `src/components/onboarding/onboarding-checklist.tsx` (barra de progreso gamificada, lista de 4 misiones con estado y créditos por misión, botón destacado para abrir `GuidedTourModal` y opción de minimizar/reabrir)
- [x] T020 [US3] Integrar `OnboardingChecklist` en `src/app/(app)/projects/page.tsx` y enlazar botón discreto de "Tour guiado" cuando el usuario ya minimizó el checklist
- [x] T021 [P] [US3] Agregar pruebas de componente en `src/components/onboarding/onboarding.test.tsx` verificando flujo del checklist, apertura/cierre del tour guiado y estados completados

**Checkpoint**: El onboarding interactivo + tour guiado funciona y premia al usuario nuevo con créditos extra sin duplicación.

---

## Phase 6: User Story 4 - Espacio de membresía y crecimiento adaptado al perfil (Priority: P2)

**Goal**: Construir la ruta `/membresia` adaptada al segmento elegido en el registro (académico vs. comercial/investigador), con estado de consumo, historial de créditos, solicitud de crecimiento y canje de códigos.

**Independent Test**: Renderizar y probar `/membresia` con perfiles `teacher`/`student` vs. `agency_company`/`researcher`, enviar una solicitud a `membership_requests` y canjear un código válido mediante `redeem_activation_code`.

### Implementation for User Story 4

- [x] T022 [US4] Crear acciones de servidor en `src/app/(app)/membresia/actions.ts` (`submitMembershipRequestAction` validando `membership_requests.requested_plan`, `membership_requests.organization_name`, `membership_requests.institutional_email` y `membership_requests.notes` según `data-model.md`, y `redeemActivationCodeAction` invocando `redeem_activation_code`)
- [x] T023 [US4] Crear componente `src/components/membership/membership-hub.tsx` mostrando: resumen de plan y topes actuales, catálogo de crecimiento adaptado a `audience_segment`, formulario contextual de solicitud de membresía/licencia, canje de código de activación e historial de movimientos de `credit_ledger`
- [x] T024 [US4] Crear página `src/app/(app)/membresia/page.tsx` y añadir enlace accesible en `src/components/workspace-nav.tsx` (y desde alertas de cuota en proyectos/estudios)
- [x] T025 [P] [US4] Agregar pruebas en `src/components/membership/membership-hub.test.tsx` cubriendo diferenciación de catálogo entre perfil académico y comercial, envío de solicitud y canje de código

**Checkpoint**: Los usuarios pueden entender su consumo, solicitar crecimiento acorde a su perfil o canjear un código de activación.

---

## Phase 7: User Story 5 - Visibilidad de audiencia, aislamiento RLS y compatibilidad universitaria (Priority: P3)

**Goal**: Garantizar aislamiento estricto entre organizaciones para perfiles, créditos, onboarding y solicitudes, y verificar que las restricciones universitarias queden documentadas y protegidas.

**Independent Test**: Revisar políticas RLS de la migración y pruebas de autorización/validación verificando que ninguna ruta cliente o server action expone ni altera registros de otra organización.

### Implementation for User Story 5

- [x] T026 [US5] Agregar pruebas SQL o tests de verificación de políticas/contratos en `supabase/tests/` o `src/lib/plans/rls-audit.test.ts` validando que `profiles`, `organizations`, `credit_ledger`, `onboarding_progress`, `membership_requests` y `activation_codes` impiden auto-elevación de plan y lectura cruzada entre orgs
- [x] T027 [US5] Documentar interruptor/criterio de compatibilidad universitaria en `docs/backlog/cambios/COG-20261120-demo-onboarding-membresia.md` explicando por qué el autorregistro DEMO aplica sólo a la plataforma principal y cómo se mantiene intacto el bloqueo de autorregistro de alumnos en ediciones universitarias

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verificación integral, puertas de calidad obligatorias y actualización final del backlog.

- [x] T028 Actualizar evidencia real de validación en `docs/backlog/cambios/COG-20261120-demo-onboarding-membresia.md`, `docs/backlog/README.md` y `docs/backlog/ADOPCION.md`
- [x] T029 Ejecutar puertas de calidad obligatorias (`npm run typecheck`, `npm run lint`, `npm test`) y validar escenarios de `specs/003-demo-onboarding-credits/quickstart.md`

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → inmediata, paralela con inicio de diseño.
- **Phase 2 (Foundational)** → bloquea todas las historias de usuario (`T003` migración SQL y `T004–T006` tipos/módulos puros).
- **Phase 3 (US1 - Registro + Audiencia)** → depende de Phase 2 (`T003`, `T004`). Entrega MVP de captura de audiencia y alta DEMO.
- **Phase 4 (US2 - Límites y Créditos)** → depende de Phase 2 (`T003`, `T005`). Puede desarrollarse en paralelo con US1 una vez terminada la Phase 2.
- **Phase 5 (US3 - Onboarding + Tour + Gamificación)** → depende de Phase 2 (`T003`, `T006`) y se integra visualmente con `/projects` y `PlanCreditBadge` (US2).
- **Phase 6 (US4 - Espacio de Membresía)** → depende de Phase 2 (`T003`, `T005`) y US1 (`audience_segment`).
- **Phase 7 (US5 - Seguridad y Compatibilidad)** → depende de Phases 3–6.
- **Phase 8 (Polish)** → depende de todas las fases anteriores.

## Implementation Strategy

1. **MVP incremental**: Completar Phase 1 + Phase 2 + US1 + US2 primero garantiza que cualquier registro público nuevo capture audiencia, entre en DEMO y no pueda generar costos sin límite.
2. **Activación y conversión**: Completar US3 (onboarding + tour + créditos extra) y US4 (`/membresia` adaptada por perfil).
3. **Cierre**: Completar US5 y pasar todas las puertas (`typecheck`, `lint`, `npm test`) actualizando el backlog antes de integrar.
