-- NeuroFusion · compositor de sesión (baterías). Diseño: docs/DISENO_COMPOSITOR.md (opción A).
--
-- Una batería ORQUESTA estudios existentes (IAT, encuesta): es una lista ordenada de estudios «hijo»
-- con su propia liga, consentimiento y sesión de participante, que enlaza las sesiones de los hijos.
-- No toca el IAT ni sus datos: un estudio de una sola herramienta se comporta exactamente igual.

-- ============================================================ tablas

create table public.batteries (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 160),
  status           text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  -- Liga mágica de la batería (la genera la app: 32 bytes aleatorios, url-safe).
  access_token     text not null unique,
  max_responses    integer check (max_responses is null or max_responses > 0),
  closes_at        timestamptz,
  duplicate_policy text not null default 'device_cookie'
                   check (duplicate_policy in ('device_cookie', 'device_cookie_and_ip', 'none')),
  -- Textos para el participante (consentimiento, agradecimiento), validados con Zod en la app.
  config           jsonb not null default '{}'::jsonb,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index batteries_project_idx on public.batteries (project_id);

create trigger batteries_touch before update on public.batteries
  for each row execute function public.touch_updated_at();

create table public.battery_steps (
  battery_id uuid not null references public.batteries (id) on delete cascade,
  position   smallint not null check (position >= 0),
  -- Un estudio que es paso de una batería no se borra por accidente. La llave es DIFERIDA: al borrar un
  -- proyecto se borran estudios y baterías en cascada, y el orden entre ambas cascadas no está garantizado;
  -- la comprobación ocurre al cerrar la transacción, cuando los pasos ya se borraron con su batería.
  study_id   uuid not null references public.studies (id) deferrable initially deferred,
  -- false = el investigador omite el paso sin quitarlo de la batería (conserva lugar y configuración).
  enabled    boolean not null default true,
  primary key (battery_id, position),
  unique (battery_id, study_id)
);
create index battery_steps_study_idx on public.battery_steps (study_id);

create table public.battery_sessions (
  id              uuid primary key default gen_random_uuid(),
  battery_id      uuid not null references public.batteries (id) on delete cascade,
  participant_ref text not null,
  status          text not null default 'started' check (status in ('started', 'completed', 'abandoned')),
  consent_version text,
  -- Orden efectivamente corrido (ids de estudio): el análisis sabe qué vio cada quien aunque la batería cambie después.
  run_order       jsonb not null default '[]'::jsonb,
  device_id       uuid,
  -- SHA-256(sal || IP). Nunca se guarda la IP en claro.
  ip_hash         text,
  user_agent      text,
  device_type     text not null default 'unknown' check (device_type in ('desktop', 'mobile', 'tablet', 'unknown')),
  duplicate_flag  boolean not null default false,
  -- Calidad común de la sesión (validez del IAT, ...), escrita por el servidor al cerrar cada paso.
  quality         jsonb not null default '{}'::jsonb,
  excluded        boolean not null default false,
  excluded_reason text,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  unique (battery_id, participant_ref)
);
create index battery_sessions_battery_idx on public.battery_sessions (battery_id, started_at desc);
create index battery_sessions_device_idx on public.battery_sessions (battery_id, device_id);

-- Las sesiones de los estudios hijo apuntan a la sesión de batería. Borrar la de batería (p. ej. por una
-- solicitud de eliminación de datos) borra las hijas en cascada.
alter table public.sessions
  add column battery_session_id uuid references public.battery_sessions (id) on delete cascade;
create index sessions_battery_session_idx on public.sessions (battery_session_id) where battery_session_id is not null;

-- ============================================================ integridad de los pasos

-- Sólo estudios con participantes (iat, survey) y del mismo proyecto que la batería.
create function public.check_battery_step()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b_project uuid;
  s_project uuid;
  s_tool    text;
begin
  select project_id into b_project from public.batteries where id = new.battery_id;
  select project_id, tool_type into s_project, s_tool from public.studies where id = new.study_id;
  if s_project is distinct from b_project then
    raise exception 'El estudio del paso debe pertenecer al mismo proyecto que la batería' using errcode = 'check_violation';
  end if;
  if s_tool not in ('iat', 'survey') then
    raise exception 'Sólo los estudios con participantes (IAT, encuesta) pueden ser pasos de una batería' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger battery_steps_check before insert or update on public.battery_steps
  for each row execute function public.check_battery_step();

revoke execute on function public.check_battery_step() from public, anon, authenticated;

-- ============================================================ RLS

create function public.battery_org(battery uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select p.org_id
  from public.batteries b join public.projects p on p.id = b.project_id
  where b.id = battery;
$$;

revoke execute on function public.battery_org(uuid) from public, anon;
grant execute on function public.battery_org(uuid) to authenticated, service_role;

alter table public.batteries        enable row level security;
alter table public.battery_steps    enable row level security;
alter table public.battery_sessions enable row level security;

create policy batteries_select on public.batteries for select to authenticated
  using (public.is_org_member(public.project_org(project_id)));
create policy batteries_insert on public.batteries for insert to authenticated
  with check (public.is_org_member(public.project_org(project_id)));
create policy batteries_update on public.batteries for update to authenticated
  using (public.is_org_member(public.project_org(project_id)))
  with check (public.is_org_member(public.project_org(project_id)));
create policy batteries_delete on public.batteries for delete to authenticated
  using (public.is_org_member(public.project_org(project_id)));

create policy battery_steps_select on public.battery_steps for select to authenticated
  using (public.is_org_member(public.battery_org(battery_id)));
create policy battery_steps_insert on public.battery_steps for insert to authenticated
  with check (public.is_org_member(public.battery_org(battery_id)));
create policy battery_steps_update on public.battery_steps for update to authenticated
  using (public.is_org_member(public.battery_org(battery_id)))
  with check (public.is_org_member(public.battery_org(battery_id)));
create policy battery_steps_delete on public.battery_steps for delete to authenticated
  using (public.is_org_member(public.battery_org(battery_id)));

-- Sesiones de batería: el investigador lee, marca exclusiones y borra; las altas pasan por la service role.
create policy battery_sessions_select on public.battery_sessions for select to authenticated
  using (public.is_org_member(public.battery_org(battery_id)));
create policy battery_sessions_update on public.battery_sessions for update to authenticated
  using (public.is_org_member(public.battery_org(battery_id)))
  with check (public.is_org_member(public.battery_org(battery_id)));
create policy battery_sessions_delete on public.battery_sessions for delete to authenticated
  using (public.is_org_member(public.battery_org(battery_id)));

revoke all on public.batteries, public.battery_steps, public.battery_sessions from anon;
revoke update on public.battery_sessions from authenticated;
grant update (excluded, excluded_reason) on public.battery_sessions to authenticated;
revoke insert on public.battery_sessions from authenticated;

-- ============================================================ alta atómica de una sesión de batería

-- Análogo a claim_session: bloquea la batería (FOR UPDATE) para que el límite de respuestas y el candado
-- anti-repetición no se salten con peticiones simultáneas. Sólo la service role puede ejecutarla.
-- Devuelve (outcome, new_session_id). outcome ∈ ok | not_found | not_published | closed | full | already_participated

create function public.claim_battery_session(
  p_battery         uuid,
  p_device_id       uuid,
  p_ip_hash         text,
  p_user_agent      text,
  p_consent_version text,
  p_device_type     text,
  p_run_order       jsonb
)
returns table (outcome text, new_session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  b      public.batteries%rowtype;
  n      integer;
  dup    boolean := false;
  new_id uuid;
begin
  select * into b from public.batteries where id = p_battery for update;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if b.status <> 'published' then
    return query select 'not_published'::text, null::uuid;
    return;
  end if;
  if b.closes_at is not null and b.closes_at <= now() then
    return query select 'closed'::text, null::uuid;
    return;
  end if;

  if b.duplicate_policy <> 'none' and p_device_id is not null then
    if exists (
      select 1 from public.battery_sessions
      where battery_id = b.id and device_id = p_device_id and status = 'completed'
    ) then
      return query select 'already_participated'::text, null::uuid;
      return;
    end if;
    -- Un intento anterior incompleto del mismo dispositivo se descarta (misma regla que claim_session).
    update public.battery_sessions set status = 'abandoned'
    where battery_id = b.id and device_id = p_device_id and status = 'started';
  end if;

  if b.max_responses is not null then
    select count(*) into n from public.battery_sessions
    where battery_id = b.id
      and (status = 'completed' or (status = 'started' and started_at > now() - interval '4 hours'));
    if n >= b.max_responses then
      return query select 'full'::text, null::uuid;
      return;
    end if;
  end if;

  if b.duplicate_policy = 'device_cookie_and_ip' and p_ip_hash is not null then
    dup := exists (
      select 1 from public.battery_sessions
      where battery_id = b.id
        and ip_hash = p_ip_hash
        and user_agent is not distinct from p_user_agent
        and status in ('started', 'completed')
    );
  end if;

  insert into public.battery_sessions (
    battery_id, participant_ref, consent_version, run_order, device_id, ip_hash, user_agent, device_type, duplicate_flag
  ) values (
    b.id, substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), p_consent_version,
    coalesce(p_run_order, '[]'::jsonb), p_device_id, p_ip_hash, left(p_user_agent, 500), p_device_type, dup
  ) returning id into new_id;

  return query select 'ok'::text, new_id;
end;
$$;

revoke all on function public.claim_battery_session(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_battery_session(uuid, uuid, text, text, text, text, jsonb) to service_role;
