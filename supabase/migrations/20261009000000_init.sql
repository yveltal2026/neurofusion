-- NeuroFusion · esquema inicial
-- Multi-tenant desde el día 1 (organizations/memberships) aunque V1 crea una org
-- personal por usuario. El investigador accede por RLS; el participante NUNCA
-- toca estas tablas: sus endpoints usan la service role y validan el token.

-- ============================================================ perfiles y orgs

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  created_at  timestamptz not null default now()
);

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table public.memberships (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- Al registrarse un usuario: perfil + organización personal + membresía owner.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org uuid;
  display text;
begin
  display := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );
  insert into public.profiles (id, full_name) values (new.id, display);
  insert into public.organizations (name)
    values (coalesce(display, 'Mi organización')) returning id into new_org;
  insert into public.memberships (org_id, user_id, role) values (new_org, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================ proyectos y estudios

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  description  text,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index projects_org_idx on public.projects (org_id);

create table public.studies (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  tool_type         text not null check (tool_type in ('iat')),
  name              text not null check (char_length(name) between 1 and 160),
  status            text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  -- Configuración del wizard (validada con Zod en la app).
  config            jsonb not null default '{}'::jsonb,
  -- Token de la liga mágica. Lo genera la app (32 bytes aleatorios, url-safe).
  access_token      text not null unique,
  max_responses     integer check (max_responses is null or max_responses > 0),
  closes_at         timestamptz,
  duplicate_policy  text not null default 'device_cookie'
                    check (duplicate_policy in ('device_cookie', 'device_cookie_and_ip', 'none')),
  created_by        uuid references auth.users (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index studies_project_idx on public.studies (project_id);

-- ============================================================ datos de participantes

create table public.sessions (
  id                uuid primary key default gen_random_uuid(),
  study_id          uuid not null references public.studies (id) on delete cascade,
  participant_ref   text not null,
  status            text not null default 'started' check (status in ('started', 'completed', 'abandoned')),
  demographics      jsonb not null default '{}'::jsonb,
  explicit_preference text check (explicit_preference in ('A', 'B', 'neutral')),
  consent_version   text,
  -- Un FirstCombo por dimensión: ["A_with_P1", "A_with_P2", ...]
  counterbalance    jsonb not null default '[]'::jsonb,
  input_mode        text check (input_mode in ('keyboard', 'touch')),
  device_type       text not null default 'unknown' check (device_type in ('desktop', 'mobile', 'tablet', 'unknown')),
  screen_width      integer,
  screen_height     integer,
  user_agent        text,
  device_id         uuid,
  -- SHA-256(sal || IP). Nunca se guarda la IP en claro.
  ip_hash           text,
  duplicate_flag    boolean not null default false,
  excluded          boolean not null default false,
  excluded_reason   text,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  unique (study_id, participant_ref)
);
create index sessions_study_idx        on public.sessions (study_id, started_at desc);
create index sessions_study_device_idx on public.sessions (study_id, device_id);
create index sessions_study_ip_idx     on public.sessions (study_id, ip_hash);

create table public.trials (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references public.sessions (id) on delete cascade,
  study_id      uuid not null references public.studies (id) on delete cascade,
  dimension_idx smallint not null check (dimension_idx >= 0),
  block         smallint not null check (block between 1 and 7),
  trial_idx     smallint not null check (trial_idx >= 0),
  category      text not null check (category in ('A', 'B', 'P1', 'P2')),
  stimulus      text not null,
  correct_side  text not null check (correct_side in ('left', 'right')),
  -- Primera respuesta del participante (si difiere de correct_side hubo error).
  pressed_side  text check (pressed_side in ('left', 'right')),
  rt_ms         real not null check (rt_ms >= 0),
  error         boolean not null default false,
  -- Idempotencia: reenviar un lote no duplica ensayos.
  unique (session_id, dimension_idx, block, trial_idx)
);
create index trials_study_idx on public.trials (study_id);

create table public.session_results (
  session_id     uuid not null references public.sessions (id) on delete cascade,
  study_id       uuid not null references public.studies (id) on delete cascade,
  dimension_idx  smallint not null,
  first_combo    text not null check (first_combo in ('A_with_P1', 'A_with_P2')),
  d_score        real,
  strength       text check (strength in ('none', 'slight', 'moderate', 'strong')),
  direction      text check (direction in ('A', 'B', 'none')),
  error_rate     real not null,
  fast_fraction  real not null,
  n_used         integer not null,
  n_trials       integer not null,
  valid          boolean not null,
  flags          text[] not null default '{}',
  computed_at    timestamptz not null default now(),
  primary key (session_id, dimension_idx)
);
create index session_results_study_idx on public.session_results (study_id);

-- ============================================================ análisis con IA

create table public.analyses (
  id               uuid primary key default gen_random_uuid(),
  study_id         uuid not null references public.studies (id) on delete cascade,
  n_sessions       integer not null,
  include_invalid  boolean not null default false,
  provider         text not null,
  model            text not null,
  -- Agregados numéricos calculados por el motor (lo único que ve la IA).
  aggregates       jsonb not null,
  -- Conclusiones estructuradas devueltas por la IA (validadas con Zod).
  result           jsonb not null,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now()
);
create index analyses_study_idx on public.analyses (study_id, created_at desc);

-- ============================================================ updated_at

create function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger studies_touch before update on public.studies
  for each row execute function public.touch_updated_at();

-- ============================================================ helpers de RLS
-- SECURITY DEFINER para evitar recursión de políticas y resolver la org dueña.

create function public.is_org_member(org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = org and m.user_id = auth.uid()
  );
$$;

create function public.project_org(project uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select org_id from public.projects where id = project;
$$;

create function public.study_org(study uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select p.org_id
  from public.studies s join public.projects p on p.id = s.project_id
  where s.id = study;
$$;

-- ============================================================ RLS

alter table public.profiles        enable row level security;
alter table public.organizations   enable row level security;
alter table public.memberships     enable row level security;
alter table public.projects        enable row level security;
alter table public.studies         enable row level security;
alter table public.sessions        enable row level security;
alter table public.trials          enable row level security;
alter table public.session_results enable row level security;
alter table public.analyses        enable row level security;

-- Perfil propio.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Organizaciones y membresías: sólo lectura para miembros (altas por trigger/servicio).
create policy organizations_select_member on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy memberships_select_own on public.memberships for select to authenticated
  using (user_id = auth.uid());

-- Proyectos: CRUD para miembros de la org.
create policy projects_select on public.projects for select to authenticated
  using (public.is_org_member(org_id));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_org_member(org_id));
create policy projects_update on public.projects for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_org_member(org_id));

-- Estudios: CRUD para miembros de la org del proyecto.
create policy studies_select on public.studies for select to authenticated
  using (public.is_org_member(public.project_org(project_id)));
create policy studies_insert on public.studies for insert to authenticated
  with check (public.is_org_member(public.project_org(project_id)));
create policy studies_update on public.studies for update to authenticated
  using (public.is_org_member(public.project_org(project_id)))
  with check (public.is_org_member(public.project_org(project_id)));
create policy studies_delete on public.studies for delete to authenticated
  using (public.is_org_member(public.project_org(project_id)));

-- Datos de participantes: el investigador lee y puede borrar; las escrituras de
-- participantes pasan por la service role (que ignora RLS).
create policy sessions_select on public.sessions for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));
create policy sessions_update on public.sessions for update to authenticated
  using (public.is_org_member(public.study_org(study_id)))
  with check (public.is_org_member(public.study_org(study_id)));
create policy sessions_delete on public.sessions for delete to authenticated
  using (public.is_org_member(public.study_org(study_id)));

create policy trials_select on public.trials for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));
create policy session_results_select on public.session_results for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));

create policy analyses_select on public.analyses for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));
create policy analyses_insert on public.analyses for insert to authenticated
  with check (public.is_org_member(public.study_org(study_id)));
create policy analyses_delete on public.analyses for delete to authenticated
  using (public.is_org_member(public.study_org(study_id)));

-- ============================================================ privilegios

-- El rol anónimo no necesita nada: los participantes entran por la API del servidor.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

-- Los investigadores sólo pueden cambiar `excluded` y `excluded_reason` en sesiones
-- (marcar duplicados/depurar la muestra); el resto de columnas lo escribe el servidor.
revoke update on public.sessions from authenticated;
grant update (excluded, excluded_reason) on public.sessions to authenticated;

-- Los resultados y ensayos son de sólo lectura para investigadores.
revoke insert, update, delete on public.trials, public.session_results from authenticated;
