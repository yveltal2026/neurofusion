-- Aesteros · Registro público DEMO, segmento de audiencia, créditos, onboarding y membresías
-- Migración compatible con cuentas previas (backfill idempotente) y endurecimiento RPC.

-- ============================================================ 1. Extensiones a profiles y organizations

alter table public.profiles
  add column if not exists audience_segment text not null default 'other'
    check (audience_segment in ('researcher', 'agency_company', 'teacher', 'student', 'other')),
  add column if not exists declared_organization text
    check (declared_organization is null or char_length(declared_organization) <= 120),
  add column if not exists audience_other_detail text
    check (audience_other_detail is null or char_length(audience_other_detail) <= 120);

alter table public.organizations
  add column if not exists plan_tier text not null default 'demo'
    check (plan_tier in ('demo', 'academic', 'pro', 'enterprise')),
  add column if not exists plan_updated_at timestamptz not null default now();

-- ============================================================ 2. Ledger inmutable de créditos

create table if not exists public.credit_ledger (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete set null,
  delta           integer not null check (delta <> 0),
  event_type      text not null check (
    event_type in (
      'initial_demo_grant',
      'onboarding_mission',
      'onboarding_complete',
      'ai_analysis',
      'ai_suggest',
      'seo_audit',
      'visual_ai',
      'refund',
      'promo_code',
      'admin_adjustment'
    )
  ),
  description     text not null check (char_length(description) between 1 and 200),
  reference_id    text,
  idempotency_key text,
  created_at      timestamptz not null default now()
);

create unique index if not exists credit_ledger_org_idempotency_uidx
  on public.credit_ledger (org_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists credit_ledger_org_created_idx
  on public.credit_ledger (org_id, created_at desc);

alter table public.credit_ledger enable row level security;

create policy credit_ledger_select_member on public.credit_ledger
  for select to authenticated
  using (public.is_org_member(org_id));

-- ============================================================ 3. Progreso de onboarding y gamificación

create table if not exists public.onboarding_progress (
  org_id                 uuid primary key references public.organizations (id) on delete cascade,
  user_id                uuid not null references auth.users (id) on delete cascade,
  completed_missions     text[] not null default '{}',
  tour_completed_at      timestamptz,
  checklist_dismissed_at timestamptz,
  bonus_awarded_at       timestamptz,
  updated_at             timestamptz not null default now()
);

create trigger onboarding_progress_touch before update on public.onboarding_progress
  for each row execute function public.touch_updated_at();

alter table public.onboarding_progress enable row level security;

create policy onboarding_progress_select_member on public.onboarding_progress
  for select to authenticated
  using (public.is_org_member(org_id));

-- ============================================================ 4. Solicitudes de crecimiento / membresía

create table if not exists public.membership_requests (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  audience_segment    text not null check (audience_segment in ('researcher', 'agency_company', 'teacher', 'student', 'other')),
  requested_plan      text not null check (requested_plan in ('academic_teacher', 'academic_institution', 'pro_researcher', 'agency_team', 'custom_credits')),
  organization_name   text not null check (char_length(organization_name) between 2 and 120),
  institutional_email text check (institutional_email is null or char_length(institutional_email) <= 160),
  notes               text check (notes is null or char_length(notes) <= 1000),
  status              text not null default 'pending' check (status in ('pending', 'contacted', 'approved', 'rejected')),
  created_at          timestamptz not null default now()
);

create index if not exists membership_requests_org_idx
  on public.membership_requests (org_id, created_at desc);

alter table public.membership_requests enable row level security;

create policy membership_requests_select_member on public.membership_requests
  for select to authenticated
  using (public.is_org_member(org_id));

create policy membership_requests_insert_member on public.membership_requests
  for insert to authenticated
  with check (
    public.is_org_member(org_id)
    and user_id = auth.uid()
    and status = 'pending'
  );

-- ============================================================ 5. Códigos de activación / promoción

create table if not exists public.activation_codes (
  code                 text primary key,
  grant_plan           text check (grant_plan is null or grant_plan in ('academic', 'pro', 'enterprise')),
  grant_credits        integer not null default 0 check (grant_credits >= 0),
  audience_restriction text[],
  max_uses             integer not null default 1 check (max_uses > 0),
  uses_count           integer not null default 0 check (uses_count >= 0),
  expires_at           timestamptz,
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);

create table if not exists public.activation_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null references public.activation_codes (code) on delete cascade,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (code, org_id)
);

alter table public.activation_codes enable row level security;
alter table public.activation_redemptions enable row level security;

create policy activation_redemptions_select_member on public.activation_redemptions
  for select to authenticated
  using (public.is_org_member(org_id));

-- ============================================================ 6. Backfill para organizaciones existentes

insert into public.credit_ledger (org_id, delta, event_type, description, idempotency_key)
select
  o.id,
  30,
  'initial_demo_grant',
  'Créditos iniciales de bienvenida DEMO',
  'initial_demo_grant'
from public.organizations o
where not exists (
  select 1 from public.credit_ledger cl
  where cl.org_id = o.id and cl.idempotency_key = 'initial_demo_grant'
);

insert into public.onboarding_progress (org_id, user_id)
select m.org_id, m.user_id
from public.memberships m
where m.role = 'owner'
  and not exists (
    select 1 from public.onboarding_progress op where op.org_id = m.org_id
  )
on conflict (org_id) do nothing;

-- ============================================================ 7. Trigger de nuevo usuario (siempre DEMO + 30 créditos)

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org         uuid;
  display         text;
  raw_segment     text;
  safe_segment    text;
  raw_org_name    text;
  safe_org_name   text;
  raw_other       text;
  safe_other      text;
begin
  display := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(new.email, '@', 1)
  );

  raw_segment := coalesce(new.raw_user_meta_data ->> 'audience_segment', 'other');
  safe_segment := case
    when raw_segment in ('researcher', 'agency_company', 'teacher', 'student', 'other') then raw_segment
    else 'other'
  end;

  raw_org_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'declared_organization', '')), '');
  safe_org_name := case when raw_org_name is not null then left(raw_org_name, 120) else null end;

  raw_other := nullif(trim(coalesce(new.raw_user_meta_data ->> 'audience_other_detail', '')), '');
  safe_other := case
    when safe_segment = 'other' and raw_other is not null then left(raw_other, 120)
    else null
  end;

  insert into public.profiles (id, full_name, audience_segment, declared_organization, audience_other_detail)
  values (new.id, display, safe_segment, safe_org_name, safe_other);

  -- Siempre inicia en plan DEMO; se ignora cualquier intento de escalado desde metadatos cliente.
  insert into public.organizations (name, plan_tier)
  values (coalesce(safe_org_name, display, 'Mi organización'), 'demo')
  returning id into new_org;

  insert into public.memberships (org_id, user_id, role)
  values (new_org, new.id, 'owner');

  insert into public.credit_ledger (org_id, user_id, delta, event_type, description, idempotency_key)
  values (new_org, new.id, 30, 'initial_demo_grant', 'Créditos iniciales de bienvenida DEMO', 'initial_demo_grant');

  insert into public.onboarding_progress (org_id, user_id)
  values (new_org, new.id);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ============================================================ 8. RPCs transaccionales de créditos y códigos

create or replace function public.get_org_credit_balance(p_org_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  total integer;
begin
  if auth.role() <> 'service_role' and not public.is_org_member(p_org_id) then
    raise exception 'forbidden';
  end if;
  select coalesce(sum(delta), 0)::integer into total
  from public.credit_ledger
  where org_id = p_org_id;
  return total;
end;
$$;

revoke all on function public.get_org_credit_balance(uuid) from public, anon;
grant execute on function public.get_org_credit_balance(uuid) to authenticated, service_role;

create or replace function public.consume_org_credits(
  p_org_id          uuid,
  p_user_id         uuid,
  p_amount          integer,
  p_event_type      text,
  p_description     text,
  p_reference_id    text default null,
  p_idempotency_key text default null
)
returns table (ok boolean, balance integer, ledger_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
  existing_id     uuid;
  inserted_id     uuid;
begin
  if p_amount <= 0 then
    raise exception 'p_amount must be positive';
  end if;

  -- Bloqueo transaccional por organización para evitar saldos negativos por concurrencia.
  perform 1 from public.organizations where id = p_org_id for update;
  if not found then
    return query select false, 0, null::uuid;
    return;
  end if;

  if p_idempotency_key is not null then
    select id into existing_id
    from public.credit_ledger
    where org_id = p_org_id and idempotency_key = p_idempotency_key
    limit 1;
    if found then
      select coalesce(sum(delta), 0)::integer into current_balance
      from public.credit_ledger where org_id = p_org_id;
      return query select true, current_balance, existing_id;
      return;
    end if;
  end if;

  select coalesce(sum(delta), 0)::integer into current_balance
  from public.credit_ledger
  where org_id = p_org_id;

  if current_balance < p_amount then
    return query select false, current_balance, null::uuid;
    return;
  end if;

  insert into public.credit_ledger (
    org_id, user_id, delta, event_type, description, reference_id, idempotency_key
  ) values (
    p_org_id, p_user_id, -p_amount, p_event_type, left(p_description, 200), p_reference_id, p_idempotency_key
  ) returning id into inserted_id;

  return query select true, (current_balance - p_amount)::integer, inserted_id;
end;
$$;

revoke all on function public.consume_org_credits(uuid, uuid, integer, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_org_credits(uuid, uuid, integer, text, text, text, text)
  to service_role;

create or replace function public.grant_org_credits(
  p_org_id          uuid,
  p_user_id         uuid,
  p_amount          integer,
  p_event_type      text,
  p_description     text,
  p_reference_id    text default null,
  p_idempotency_key text default null
)
returns table (granted boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'p_amount must be positive';
  end if;

  perform 1 from public.organizations where id = p_org_id for update;
  if not found then
    return query select false, 0;
    return;
  end if;

  if p_idempotency_key is not null and exists (
    select 1 from public.credit_ledger
    where org_id = p_org_id and idempotency_key = p_idempotency_key
  ) then
    select coalesce(sum(delta), 0)::integer into current_balance
    from public.credit_ledger where org_id = p_org_id;
    return query select false, current_balance;
    return;
  end if;

  insert into public.credit_ledger (
    org_id, user_id, delta, event_type, description, reference_id, idempotency_key
  ) values (
    p_org_id, p_user_id, p_amount, p_event_type, left(p_description, 200), p_reference_id, p_idempotency_key
  );

  select coalesce(sum(delta), 0)::integer into current_balance
  from public.credit_ledger where org_id = p_org_id;

  return query select true, current_balance;
end;
$$;

revoke all on function public.grant_org_credits(uuid, uuid, integer, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.grant_org_credits(uuid, uuid, integer, text, text, text, text)
  to service_role;

create or replace function public.redeem_activation_code(
  p_org_id  uuid,
  p_user_id uuid,
  p_code    text
)
returns table (ok boolean, message text, new_plan text, credits_added integer, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  norm_code       text := upper(trim(coalesce(p_code, '')));
  c_row           public.activation_codes%rowtype;
  org_row         public.organizations%rowtype;
  user_segment    text;
  current_balance integer;
  applied_plan    text;
begin
  if norm_code = '' then
    return query select false, 'Ingresa un código de activación válido.'::text, null::text, 0, 0;
    return;
  end if;

  select * into org_row from public.organizations where id = p_org_id for update;
  if not found then
    return query select false, 'Organización no encontrada.'::text, null::text, 0, 0;
    return;
  end if;

  select * into c_row from public.activation_codes where code = norm_code for update;
  if not found or not c_row.active then
    select coalesce(sum(delta), 0)::integer into current_balance from public.credit_ledger where org_id = p_org_id;
    return query select false, 'El código no es válido o ya no está disponible.'::text, org_row.plan_tier, 0, current_balance;
    return;
  end if;

  if c_row.expires_at is not null and c_row.expires_at <= now() then
    select coalesce(sum(delta), 0)::integer into current_balance from public.credit_ledger where org_id = p_org_id;
    return query select false, 'Este código ya expiró.'::text, org_row.plan_tier, 0, current_balance;
    return;
  end if;

  if c_row.uses_count >= c_row.max_uses then
    select coalesce(sum(delta), 0)::integer into current_balance from public.credit_ledger where org_id = p_org_id;
    return query select false, 'Este código alcanzó su límite máximo de usos.'::text, org_row.plan_tier, 0, current_balance;
    return;
  end if;

  if exists (
    select 1 from public.activation_redemptions where code = norm_code and org_id = p_org_id
  ) then
    select coalesce(sum(delta), 0)::integer into current_balance from public.credit_ledger where org_id = p_org_id;
    return query select false, 'Ya canjeaste este código en tu organización.'::text, org_row.plan_tier, 0, current_balance;
    return;
  end if;

  if c_row.audience_restriction is not null and array_length(c_row.audience_restriction, 1) > 0 then
    select audience_segment into user_segment from public.profiles where id = p_user_id;
    if user_segment is null or not (user_segment = any(c_row.audience_restriction)) then
      select coalesce(sum(delta), 0)::integer into current_balance from public.credit_ledger where org_id = p_org_id;
      return query select false, 'Este código está reservado para otro tipo de perfil.'::text, org_row.plan_tier, 0, current_balance;
      return;
    end if;
  end if;

  insert into public.activation_redemptions (code, org_id, user_id)
  values (norm_code, p_org_id, p_user_id);

  update public.activation_codes
  set uses_count = uses_count + 1
  where code = norm_code;

  applied_plan := org_row.plan_tier;
  if c_row.grant_plan is not null then
    update public.organizations
    set plan_tier = c_row.grant_plan, plan_updated_at = now()
    where id = p_org_id;
    applied_plan := c_row.grant_plan;
  end if;

  if c_row.grant_credits > 0 then
    insert into public.credit_ledger (
      org_id, user_id, delta, event_type, description, reference_id, idempotency_key
    ) values (
      p_org_id,
      p_user_id,
      c_row.grant_credits,
      'promo_code',
      'Canje de código ' || norm_code,
      norm_code,
      'promo_code:' || norm_code
    )
    on conflict (org_id, idempotency_key) where idempotency_key is not null do nothing;
  end if;

  select coalesce(sum(delta), 0)::integer into current_balance
  from public.credit_ledger where org_id = p_org_id;

  return query select true, 'Código aplicado correctamente.'::text, applied_plan, c_row.grant_credits, current_balance;
end;
$$;

revoke all on function public.redeem_activation_code(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.redeem_activation_code(uuid, uuid, text)
  to service_role;

-- ============================================================ 9. Tope de 15 respuestas en DEMO dentro de claim_session

create or replace function public.claim_session(
  p_study            uuid,
  p_device_id        uuid,
  p_ip_hash          text,
  p_user_agent       text,
  p_demographics     jsonb,
  p_explicit         text,
  p_consent_version  text,
  p_counterbalance   jsonb,
  p_input_mode       text,
  p_device_type      text,
  p_screen_width     integer,
  p_screen_height    integer
)
returns table (outcome text, new_session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  s              public.studies%rowtype;
  org_plan       text;
  effective_max  integer;
  n              integer;
  dup            boolean := false;
  new_id         uuid;
begin
  select * into s from public.studies where id = p_study for update;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if s.status <> 'published' then
    return query select 'not_published'::text, null::uuid;
    return;
  end if;
  if s.closes_at is not null and s.closes_at <= now() then
    return query select 'closed'::text, null::uuid;
    return;
  end if;

  select o.plan_tier into org_plan
  from public.projects p
  join public.organizations o on o.id = p.org_id
  where p.id = s.project_id;

  effective_max := case
    when coalesce(org_plan, 'demo') = 'demo' then least(coalesce(s.max_responses, 15), 15)
    else s.max_responses
  end;

  -- Candado por dispositivo (cookie firmada con device_id).
  if s.duplicate_policy <> 'none' and p_device_id is not null then
    if exists (
      select 1 from public.sessions
      where study_id = s.id and device_id = p_device_id and status = 'completed'
    ) then
      return query select 'already_participated'::text, null::uuid;
      return;
    end if;
    update public.sessions set status = 'abandoned'
    where study_id = s.id and device_id = p_device_id and status = 'started';
  end if;

  -- Límite de respuestas: completadas + en curso recientes.
  if effective_max is not null then
    select count(*) into n from public.sessions
    where study_id = s.id
      and (status = 'completed' or (status = 'started' and started_at > now() - interval '2 hours'));
    if n >= effective_max then
      return query select 'full'::text, null::uuid;
      return;
    end if;
  end if;

  -- Huella de IP: no bloquea (en un salón de clase muchos comparten IP); sólo marca.
  if s.duplicate_policy = 'device_cookie_and_ip' and p_ip_hash is not null then
    dup := exists (
      select 1 from public.sessions
      where study_id = s.id
        and ip_hash = p_ip_hash
        and user_agent is not distinct from p_user_agent
        and status in ('started', 'completed')
    );
  end if;

  insert into public.sessions (
    study_id, participant_ref, demographics, explicit_preference, consent_version,
    counterbalance, input_mode, device_type, screen_width, screen_height,
    user_agent, device_id, ip_hash, duplicate_flag
  ) values (
    s.id, substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), p_demographics,
    p_explicit, p_consent_version, p_counterbalance, p_input_mode, p_device_type,
    p_screen_width, p_screen_height, left(p_user_agent, 500), p_device_id, p_ip_hash, dup
  ) returning id into new_id;

  return query select 'ok'::text, new_id;
end;
$$;

revoke all on function public.claim_session(uuid, uuid, text, text, jsonb, text, text, jsonb, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_session(uuid, uuid, text, text, jsonb, text, text, jsonb, text, text, integer, integer)
  to service_role;
