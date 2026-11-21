# Data Model: Registro Público DEMO, Límites/Créditos, Membresía por Perfil y Onboarding Gamificado

**Feature**: `003-demo-onboarding-credits` | **Date**: 2026-11-20  
**Migration target**: `supabase/migrations/20261120000000_demo_onboarding_credits.sql`

## Entities & Constraints

### 1. `profiles` (Extensión de tabla existente)

| Field | Type & Constraints | Description |
| --- | --- | --- |
| `id` | `uuid primary key references auth.users(id)` | ID de usuario autenticado (existente) |
| `full_name` | `text` | Nombre completo (existente) |
| `audience_segment` | `text not null default 'other' check (audience_segment in ('researcher','agency_company','teacher','student','other'))` | Segmento seleccionado al registrarse |
| `declared_organization` | `text check (declared_organization is null or char_length(declared_organization) <= 120)` | Organización/universidad declarada en el registro |
| `audience_other_detail` | `text check (audience_other_detail is null or char_length(audience_other_detail) <= 120)` | Detalle opcional cuando `audience_segment = 'other'` |
| `created_at` | `timestamptz not null default now()` | Fecha de alta (existente) |

**RLS**: El usuario sólo puede leer y actualizar su nombre o `declared_organization` propios; nunca puede elevar roles o planes (los planes viven en `organizations`).

---

### 2. `organizations` (Extensión de tabla existente)

| Field | Type & Constraints | Description |
| --- | --- | --- |
| `id` | `uuid primary key` | ID de organización (existente) |
| `name` | `text not null` | Nombre de organización (existente) |
| `plan_tier` | `text not null default 'demo' check (plan_tier in ('demo','academic','pro','enterprise'))` | Nivel de membresía activo |
| `plan_updated_at` | `timestamptz not null default now()` | Último cambio de plan |
| `created_at` | `timestamptz not null default now()` | Fecha de creación (existente) |

**RLS**: Sólo lectura para miembros (`is_org_member(id)`). Los cambios de `plan_tier` únicamente ocurren mediante funciones `security definer` en servidor (`redeem_activation_code`, administración con `service_role`).

---

### 3. `credit_ledger` (Nueva tabla append-only)

| Field | Type & Constraints | Description |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Identificador del movimiento |
| `org_id` | `uuid not null references public.organizations(id) on delete cascade` | Organización dueña del saldo |
| `user_id` | `uuid references auth.users(id) on delete set null` | Usuario que disparó la acción (si aplica) |
| `delta` | `integer not null check (delta <> 0)` | Positivo para abonos, negativo para consumos |
| `event_type` | `text not null check (event_type in ('initial_demo_grant','onboarding_mission','onboarding_complete','ai_analysis','ai_suggest','seo_audit','visual_ai','refund','promo_code','admin_adjustment'))` | Categoría del movimiento |
| `description` | `text not null check (char_length(description) between 1 and 200)` | Descripción legible para historial |
| `reference_id` | `text` | ID de estudio, misión o código relacionado |
| `idempotency_key` | `text` | Clave única opcional por organización para evitar duplicados |
| `created_at` | `timestamptz not null default now()` | Marca de tiempo del movimiento |

**Indexes / Constraints**:
- `unique (org_id, idempotency_key) where idempotency_key is not null`
- `index credit_ledger_org_created_idx on public.credit_ledger (org_id, created_at desc)`
- **RLS**: `SELECT` permitido sólo a miembros (`is_org_member(org_id)`). Sin `INSERT`/`UPDATE`/`DELETE` directo desde clientes `authenticated`; toda escritura pasa por RPCs `security definer` o `service_role`.

---

### 4. `onboarding_progress` (Nueva tabla)

| Field | Type & Constraints | Description |
| --- | --- | --- |
| `org_id` | `uuid primary key references public.organizations(id) on delete cascade` | Organización vinculada al progreso |
| `user_id` | `uuid not null references auth.users(id) on delete cascade` | Usuario dueño inicial |
| `completed_missions` | `text[] not null default '{}'` | Claves completadas (`'profile_confirmed'`, `'first_project'`, `'first_study'`, `'guided_tour_or_sample'`) |
| `tour_completed_at` | `timestamptz` | Marca si recorrió el tour guiado |
| `checklist_dismissed_at` | `timestamptz` | Si minimizó/ocultó el panel tras explorar |
| `bonus_awarded_at` | `timestamptz` | Fecha de entrega del bono completo |
| `updated_at` | `timestamptz not null default now()` | Última actualización |

**Mission Reward Rules**:
- `profile_confirmed`: +5 créditos (completada automáticamente al confirmar/guardar perfil en onboarding o registro completo)
- `first_project`: +10 créditos (validado en servidor al existir >= 1 fila en `projects` para `org_id`)
- `first_study`: +10 créditos (validado en servidor al existir >= 1 fila en `studies` de la `org_id`)
- `guided_tour_or_sample`: +5 créditos (completado al terminar el tour guiado o usar `/muestra` / crear primera vista previa)
- **Total máximo onboarding**: +30 créditos, acreditados mediante `idempotency_key = 'onboarding:<mission_key>'`.

---

### 5. `membership_requests` (Nueva tabla)

| Field | Type & Constraints | Description |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Identificador de solicitud |
| `org_id` | `uuid not null references public.organizations(id) on delete cascade` | Organización solicitante |
| `user_id` | `uuid not null references auth.users(id) on delete cascade` | Usuario solicitante |
| `audience_segment` | `text not null check (audience_segment in ('researcher','agency_company','teacher','student','other'))` | Snapshot del perfil |
| `requested_plan` | `text not null check (requested_plan in ('academic_teacher','academic_institution','pro_researcher','agency_team','custom_credits'))` | Plan o licencia solicitada |
| `organization_name` | `text not null check (char_length(organization_name) between 2 and 120)` | Empresa, agencia o universidad |
| `institutional_email` | `text check (institutional_email is null or char_length(institutional_email) <= 160)` | Correo institucional o de contacto |
| `notes` | `text check (notes is null or char_length(notes) <= 1000)` | Contexto de uso, tamaño de grupo o proyecto |
| `status` | `text not null default 'pending' check (status in ('pending','contacted','approved','rejected'))` | Estado de atención |
| `created_at` | `timestamptz not null default now()` | Fecha de solicitud |

**RLS**: Miembros de la org pueden `SELECT` e `INSERT` (`requested_plan` validado, `status` forzado a `'pending'` vía check/default); actualización de `status` reservada a `service_role`.

---

### 6. `activation_codes` y `activation_redemptions` (Nuevas tablas)

- `activation_codes`: `code text primary key`, `grant_plan text check (grant_plan in ('academic','pro','enterprise'))`, `grant_credits integer not null default 0 check (grant_credits >= 0)`, `audience_restriction text[]`, `max_uses integer not null default 1 check (max_uses > 0)`, `uses_count integer not null default 0`, `expires_at timestamptz`, `active boolean not null default true`.
- `activation_redemptions`: `id uuid primary key`, `code text references activation_codes(code)`, `org_id uuid references organizations(id)`, `user_id uuid references auth.users(id)`, `redeemed_at timestamptz default now()`, `unique (code, org_id)`.
- **RLS**: `activation_codes` no se expone directamente al cliente (`RLS enabled` sin políticas públicas). Sólo se canjea mediante RPC `redeem_activation_code(p_org_id, p_user_id, p_code)` invocada por server action.

## RPCs Transaccionales (`security definer`, sólo `service_role` / server-verified)

1. `get_org_credit_balance(p_org_id uuid) returns integer`
2. `consume_org_credits(p_org_id uuid, p_user_id uuid, p_amount integer, p_event_type text, p_description text, p_reference_id text, p_idempotency_key text) returns table (ok boolean, balance integer, ledger_id uuid)`
3. `grant_org_credits(p_org_id uuid, p_user_id uuid, p_amount integer, p_event_type text, p_description text, p_reference_id text, p_idempotency_key text) returns table (granted boolean, balance integer)`
4. `redeem_activation_code(p_org_id uuid, p_user_id uuid, p_code text) returns table (ok boolean, message text, new_plan text, credits_added integer, balance integer)`
5. Actualización de `claim_session(...)` para aplicar tope de respuestas `15` cuando la organización del estudio tiene `plan_tier = 'demo'`.
