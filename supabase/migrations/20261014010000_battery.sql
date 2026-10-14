-- NeuroFusion · compositor de sesión (baterías).
--
-- Una batería es una lista ordenada de estudios existentes (IAT, encuesta) que un participante
-- recorre con una sola liga. NO modifica el modelo de los estudios: cada paso sigue siendo un
-- estudio completo con su propia configuración, su liga y sus tablas. La batería sólo añade su
-- liga, un consentimiento y una sesión de participante que enlaza las sesiones de los pasos.
-- Diseño y decisiones en docs/DISENO_COMPOSITOR.md.

-- ============================================================ tablas

create table public.batteries (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 160),
  status           text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  -- Textos para el participante (título, introducción, consentimiento, agradecimiento).
  config           jsonb not null default '{}'::jsonb,
  -- Liga mágica de la batería (la genera la app, 32 bytes aleatorios url-safe).
  access_token     text not null unique,
  max_responses    integer check (max_responses is null or max_responses > 0),
  closes_at        timestamptz,
  duplicate_policy text not null default 'device_cookie'
                   check (duplicate_policy in ('device_cookie', 'device_cookie_and_ip', 'none')),
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
  -- restrict: un estudio que forma parte de una batería no se borra sin quitarlo antes.
  study_id   uuid not null references public.studies (id) on delete restrict,
  -- false = el investigador omite el paso sin quitarlo (conserva su lugar y su configuración).
  enabled    boolean not null default true,
  primary key (battery_id, position),
  unique (battery_id, study_id)
);

create table public.battery_sessions (
  id              uuid primary key default gen_random_uuid(),
  battery_id      uuid not null references public.batteries (id) on delete cascade,
  participant_ref text not null,
  status          text not null default 'started' check (status in ('started', 'completed', 'abandoned')),
  consent_version text,
  -- Orden efectivo que corrió este participante (ids de estudio de los pasos activos al iniciar).
  -- Queda fijo aunque la batería cambie después.
  run_order       jsonb not null default '[]'::jsonb,
  device_id       uuid,
  ip_hash         text,
  user_agent      text,
  device_type     text not null default 'unknown' check (device_type in ('desktop', 'mobile', 'tablet', 'unknown')),
  -- Calidad común de la sesión (validez del IAT, calibración de mirada, ...). La escribe el servidor.
  quality         jsonb not null default '{}'::jsonb,
  excluded        boolean not null default false,
  excluded_reason text,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  unique (battery_id, participant_ref)
);
create index battery_sessions_battery_idx on public.battery_sessions (battery_id, started_at desc);
create index battery_sessions_device_idx  on public.battery_sessions (battery_id, device_id);

-- Las sesiones de los pasos apuntan a la sesión de batería. Borrar la sesión de batería (p. ej. por
-- una solicitud de eliminación del participante) borra también las sesiones hijas y sus datos.
alter table public.sessions
  add column battery_session_id uuid references public.battery_sessions (id) on delete cascade;
create index sessions_battery_session_idx on public.sessions (battery_session_id) where battery_session_id is not null;

-- ============================================================ reglas de integridad

-- Un paso debe ser un estudio con participantes (iat/encuesta) del MISMO proyecto que la batería.
create function public.battery_steps_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  s_tool    text;
  s_project uuid;
  b_project uuid;
begin
  select tool_type, project_id into s_tool, s_project from public.studies where id = new.study_id;
  select project_id into b_project from public.batteries where id = new.battery_id;
  if s_tool is null or b_project is null then
    raise exception 'El estudio o la batería no existe' using errcode = '23514';
  end if;
  if s_tool not in ('iat', 'survey') then
    raise exception 'Sólo los estudios IAT y encuesta pueden ser pasos de una batería' using errcode = '23514';
  end if;
  if s_project <> b_project then
    raise exception 'El estudio debe pertenecer al mismo proyecto que la batería' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger battery_steps_guard_trg before insert or update on public.battery_steps
  for each row execute function public.battery_steps_guard();

-- Cuando ya hay participantes, los pasos no se tocan: mezclar muestras que corrieron en órdenes
-- distintos sin que quede claro invalida la comparación. Para cambiar, se duplica la batería.
-- Si la batería ya no existe (borrado en cascada), se permite.
create function public.battery_steps_lock()
returns trigger language plpgsql set search_path = public as $$
declare
  bid uuid;
begin
  if tg_op = 'INSERT' then bid := new.battery_id; else bid := old.battery_id; end if;
  if exists (select 1 from public.batteries where id = bid)
     and exists (select 1 from public.battery_sessions where battery_id = bid) then
    raise exception 'La batería ya tiene respuestas: duplícala para cambiar sus pasos' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger battery_steps_lock_trg before insert or update or delete on public.battery_steps
  for each row execute function public.battery_steps_lock();

-- ============================================================ RLS

create function public.battery_org(battery uuid)
returns uuid language sql stable security definer set search_path = public as $$
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

-- Las sesiones de batería las crea el servidor (service role). El investigador las lee, puede
-- marcarlas como excluidas y borrarlas (derecho de eliminación, que arrastra a las sesiones hijas).
create policy battery_sessions_select on public.battery_sessions for select to authenticated
  using (public.is_org_member(public.battery_org(battery_id)));
create policy battery_sessions_update on public.battery_sessions for update to authenticated
  using (public.is_org_member(public.battery_org(battery_id)))
  with check (public.is_org_member(public.battery_org(battery_id)));
create policy battery_sessions_delete on public.battery_sessions for delete to authenticated
  using (public.is_org_member(public.battery_org(battery_id)));

revoke all on public.batteries, public.battery_steps, public.battery_sessions from anon;
revoke insert on public.battery_sessions from authenticated;
revoke update on public.battery_sessions from authenticated;
grant update (excluded, excluded_reason) on public.battery_sessions to authenticated;

-- ============================================================ edición atómica de los pasos

-- Reemplaza TODOS los pasos de una batería en una sola transacción. Hace falta porque cambiar el
-- orden con UPDATE fila por fila chocaría con la llave primaria (battery_id, position) a mitad de
-- la operación. SECURITY INVOKER: RLS y los disparadores de integridad se aplican al investigador.
-- p_steps: [{"study_id": "<uuid>", "enabled": true}, ...] en el orden deseado.
create function public.save_battery_steps(p_battery uuid, p_steps jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  -- Si p_steps no es una lista, jsonb_array_elements falla (22023) y la transacción se revierte.
  delete from public.battery_steps where battery_id = p_battery;
  insert into public.battery_steps (battery_id, position, study_id, enabled)
  select p_battery, (t.ord - 1)::smallint, (t.e ->> 'study_id')::uuid, coalesce((t.e ->> 'enabled')::boolean, true)
  from jsonb_array_elements(p_steps) with ordinality as t(e, ord);
end;
$$;

revoke execute on function public.save_battery_steps(uuid, jsonb) from public, anon;
grant execute on function public.save_battery_steps(uuid, jsonb) to authenticated, service_role;

-- ============================================================ sesiones del participante (sólo service role)

-- Alta atómica de una sesión de batería: bloquea la batería (FOR UPDATE) para que el límite de
-- respuestas y el candado no se salten con peticiones simultáneas. Devuelve
--   ok | resumed | already_participated | full | closed | not_published | no_steps | not_found
-- `resumed`: el mismo dispositivo tenía una sesión sin terminar; se reanuda en vez de empezar otra
-- (las sesiones hijas ya completadas están ligadas a ésa).
create function public.claim_battery_session(
  p_battery         uuid,
  p_device_id       uuid,
  p_ip_hash         text,
  p_user_agent      text,
  p_consent_version text,
  p_device_type     text
)
returns table (outcome text, new_session_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  b          public.batteries%rowtype;
  n          integer;
  steps_json jsonb;
  sid        uuid;
begin
  select * into b from public.batteries where id = p_battery for update;
  if not found then
    return query select 'not_found'::text, null::uuid; return;
  end if;
  if b.status <> 'published' then
    return query select 'not_published'::text, null::uuid; return;
  end if;
  if b.closes_at is not null and b.closes_at <= now() then
    return query select 'closed'::text, null::uuid; return;
  end if;

  select coalesce(jsonb_agg(study_id order by position), '[]'::jsonb) into steps_json
  from public.battery_steps where battery_id = b.id and enabled;
  if steps_json = '[]'::jsonb then
    return query select 'no_steps'::text, null::uuid; return;
  end if;

  if b.duplicate_policy <> 'none' and p_device_id is not null then
    if exists (
      select 1 from public.battery_sessions
      where battery_id = b.id and device_id = p_device_id and status = 'completed'
    ) then
      return query select 'already_participated'::text, null::uuid; return;
    end if;
    select id into sid from public.battery_sessions
    where battery_id = b.id and device_id = p_device_id and status = 'started'
    order by started_at desc limit 1;
    if found then
      return query select 'resumed'::text, sid; return;
    end if;
  end if;

  if b.max_responses is not null then
    select count(*) into n from public.battery_sessions
    where battery_id = b.id
      and (status = 'completed' or (status = 'started' and started_at > now() - interval '2 hours'));
    if n >= b.max_responses then
      return query select 'full'::text, null::uuid; return;
    end if;
  end if;

  insert into public.battery_sessions (
    battery_id, participant_ref, consent_version, run_order, device_id, ip_hash, user_agent, device_type
  ) values (
    b.id, substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), p_consent_version, steps_json,
    p_device_id, p_ip_hash, left(p_user_agent, 500), p_device_type
  ) returning id into sid;

  return query select 'ok'::text, sid;
end;
$$;

-- Enlaza la sesión de un paso (ya creada con claim_session) a la sesión de batería. Valida en la
-- base de datos que el estudio sea un paso de esa sesión y que se respete el ORDEN: un paso sólo
-- puede empezar cuando todos los anteriores de su run_order están completados.
-- Devuelve ok | session_not_found | battery_session_not_found | battery_session_closed |
--          session_not_started | already_linked | study_not_in_battery | out_of_order
create function public.link_battery_step(p_session uuid, p_battery_session uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  s   public.sessions%rowtype;
  bs  public.battery_sessions%rowtype;
  pos integer;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then return 'session_not_found'; end if;
  select * into bs from public.battery_sessions where id = p_battery_session;
  if not found then return 'battery_session_not_found'; end if;
  if bs.status <> 'started' then return 'battery_session_closed'; end if;
  if s.status <> 'started' then return 'session_not_started'; end if;
  if s.battery_session_id is not null then
    return case when s.battery_session_id = p_battery_session then 'ok' else 'already_linked' end;
  end if;

  select t.ord into pos
  from jsonb_array_elements_text(bs.run_order) with ordinality as t(study, ord)
  where t.study = s.study_id::text;
  if pos is null then return 'study_not_in_battery'; end if;

  if exists (
    select 1
    from jsonb_array_elements_text(bs.run_order) with ordinality as t(study, ord)
    where t.ord < pos
      and not exists (
        select 1 from public.sessions c
        where c.battery_session_id = p_battery_session
          and c.study_id = t.study::uuid
          and c.status = 'completed'
      )
  ) then
    return 'out_of_order';
  end if;

  update public.sessions set battery_session_id = p_battery_session where id = p_session;
  return 'ok';
end;
$$;

-- Cierra la sesión de batería si TODOS los pasos de su run_order están completados.
-- Devuelve ok (idempotente) | incomplete | not_found.
create function public.complete_battery_session(p_battery_session uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  bs public.battery_sessions%rowtype;
begin
  select * into bs from public.battery_sessions where id = p_battery_session for update;
  if not found then return 'not_found'; end if;
  if bs.status = 'completed' then return 'ok'; end if;
  if bs.status <> 'started' then return 'not_found'; end if;

  if exists (
    select 1
    from jsonb_array_elements_text(bs.run_order) as t(study)
    where not exists (
      select 1 from public.sessions c
      where c.battery_session_id = bs.id and c.study_id = t.study::uuid and c.status = 'completed'
    )
  ) then
    return 'incomplete';
  end if;

  update public.battery_sessions set status = 'completed', completed_at = now() where id = bs.id;
  return 'ok';
end;
$$;

revoke all on function public.claim_battery_session(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.link_battery_step(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_battery_session(uuid) from public, anon, authenticated;
grant execute on function public.claim_battery_session(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.link_battery_step(uuid, uuid) to service_role;
grant execute on function public.complete_battery_session(uuid) to service_role;
