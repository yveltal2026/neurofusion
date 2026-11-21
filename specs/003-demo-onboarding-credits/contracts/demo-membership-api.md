# Interface & Server Contracts: Demo, Credits, Onboarding & Membership

**Feature**: `003-demo-onboarding-credits` | **Date**: 2026-11-20

## 1. Auth & Registro (`/entrar` y `src/lib/auth/actions.ts`)

- `signUp` Server Action acepta:
  - `full_name`: `string` (opcional, máx. 120)
  - `email`: `string` (requerido, email válido)
  - `password`: `string` (requerido, mín. 8)
  - `audience_segment`: `'researcher' | 'agency_company' | 'teacher' | 'student' | 'other'` (**requerido**)
  - `declared_organization`: `string` (opcional, máx. 120)
  - `audience_other_detail`: `string` (opcional, máx. 120)
- Comportamiento: valida con Zod, pasa únicamente metadatos de audiencia a `supabase.auth.signUp({ options: { data } })`. El trigger `handle_new_user()` crea la organización siempre en `plan_tier = 'demo'` y registra `+30` créditos (`initial_demo_grant`).

## 2. Guardias de Cuota y Créditos (`src/lib/plans/server.ts`)

- `getOrgBillingSummary(supabase, orgId)` → retorna:
  ```ts
  interface OrgBillingSummary {
    orgId: string;
    planTier: "demo" | "academic" | "pro" | "enterprise";
    creditBalance: number;
    audienceSegment: AudienceSegment;
    limits: {
      maxProjects: number | null;
      maxStudies: number | null;
      maxResponsesPerStudy: number | null;
    };
    usage: {
      projectsCount: number;
      studiesCount: number;
    };
  }
  ```
- `assertCanCreateProject(supabase, orgId)` → `{ ok: true } | { ok: false; error: string }`
- `assertCanCreateStudy(supabase, orgId)` → `{ ok: true } | { ok: false; error: string }`
- `reserveCreditsForAction(orgId, userId, actionKey, referenceId)` → descuenta atómicamente (`ai_analysis`: 5, `seo_audit`: 10, `visual_ai`: 5, `ai_suggest`: 2) o retorna error con saldo actual y enlace a `/membresia`.
- `refundReservedCredits(orgId, userId, ledgerId, reason)` → reintegro idempotente si el proveedor externo falla sin entregar resultado.

## 3. Onboarding y Gamificación (`src/lib/onboarding/actions.ts`)

- `syncOnboardingMissions(orgId, userId)`:
  - Evalúa estado real en BD (`projects`, `studies`, `onboarding_progress`) y acredita misiones completadas de forma idempotente (`+5`, `+10`, `+10`).
- `completeTourMissionAction()`:
  - Server Action llamada al completar el tour guiado o confirmar su revisión; registra `tour_completed_at` y acredita `+5` créditos idempotentes (`guided_tour_or_sample`).
- `dismissOnboardingChecklistAction()`:
  - Marca `checklist_dismissed_at` sin borrar progreso ni bloquear reapertura del tour.

## 4. Membresía por Perfil (`/membresia` y `src/app/(app)/membresia/actions.ts`)

- `submitMembershipRequestAction(_prev, formData)`:
  - Valida con Zod según `audience_segment` del perfil; inserta fila en `membership_requests` con `status = 'pending'`.
- `redeemActivationCodeAction(_prev, formData)`:
  - Valida formato del código y ejecuta `redeem_activation_code` vía `createAdminClient()` verificando antes la membresía del usuario en `orgId`.
  - Actualiza `plan_tier` y/o abona créditos extra; revalida `/membresia` y `(app)` layout.

## 5. Participantes (`/api/s/[token]/*` y `claim_session`)

- Cuando `plan_tier === 'demo'`, `claim_session` (y el inicio de sesión de `web_eyetracking`) limita la recolección a `15` respuestas por estudio devolviendo `outcome = 'full'` con mensaje estándar de estudio completo al participante.
