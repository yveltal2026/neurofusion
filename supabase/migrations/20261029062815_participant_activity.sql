-- Presence is separate from study results. No public client can write these columns.
alter table public.sessions
  add column last_activity_at timestamptz not null default now(),
  add column inactive_since timestamptz,
  add column abandoned_at timestamptz,
  add column abandon_reason text check (abandon_reason in ('inactivity', 'interrupted'));
alter table public.battery_sessions
  add column last_activity_at timestamptz not null default now(),
  add column inactive_since timestamptz,
  add column abandoned_at timestamptz,
  add column abandon_reason text check (abandon_reason in ('inactivity', 'interrupted'));
-- Legacy records have no presence signal: their start/completion is the only available evidence.
update public.sessions set last_activity_at = coalesce(completed_at, started_at);
update public.battery_sessions set last_activity_at = coalesce(completed_at, started_at);
update public.sessions set status = 'abandoned', abandon_reason = 'inactivity', abandoned_at = now()
where status = 'started' and last_activity_at <= now() - interval '30 minutes';
update public.battery_sessions set status = 'abandoned', abandon_reason = 'inactivity', abandoned_at = now()
where status = 'started' and last_activity_at <= now() - interval '30 minutes';
create index sessions_activity_idx on public.sessions(study_id, last_activity_at) where status = 'started';
create index battery_sessions_activity_idx on public.battery_sessions(battery_id, last_activity_at) where status = 'started';

create function public.record_participation_state()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    new.last_activity_at := now(); new.inactive_since := null;
    new.abandoned_at := null; new.abandon_reason := null;
  elsif new.status = 'abandoned' and old.status <> 'abandoned' then
    new.abandoned_at := coalesce(new.abandoned_at, now());
    new.abandon_reason := coalesce(new.abandon_reason, 'interrupted');
  end if;
  return new;
end;
$$;
create trigger sessions_activity_state before update on public.sessions for each row execute function public.record_participation_state();
create trigger battery_sessions_activity_state before update on public.battery_sessions for each row execute function public.record_participation_state();
revoke all on function public.record_participation_state() from public, anon, authenticated;

-- Only the server may call this, after matching the link and a signed device cookie.
-- Invoker security: service_role already has the required table privileges.
create function public.touch_participation_activity(p_kind text, p_parent uuid, p_session uuid, p_device uuid, p_away boolean)
returns text language plpgsql security invoker set search_path = public as $$
declare
  current_status text;
  last_seen timestamptz;
  away_since timestamptz;
begin
  if p_kind = 'study' then
    select status, last_activity_at, inactive_since into current_status, last_seen, away_since
    from public.sessions where id = p_session and study_id = p_parent and device_id = p_device for update;
  elsif p_kind = 'battery' then
    select status, last_activity_at, inactive_since into current_status, last_seen, away_since
    from public.battery_sessions where id = p_session and battery_id = p_parent and device_id = p_device for update;
  else return 'not_found'; end if;
  if current_status is null then return 'not_found'; end if;
  if current_status = 'completed' then return 'completed'; end if;
  if current_status = 'abandoned' then return 'expired'; end if;
  if coalesce(away_since, last_seen) <= now() - interval '30 minutes' then
    if p_kind = 'study' then
      update public.sessions set status = 'abandoned', abandon_reason = 'inactivity' where id = p_session and status = 'started';
    else
      update public.battery_sessions set status = 'abandoned', abandon_reason = 'inactivity' where id = p_session and status = 'started';
      update public.sessions set status = 'abandoned', abandon_reason = 'inactivity' where battery_session_id = p_session and status = 'started';
    end if;
    return 'expired';
  end if;
  if p_kind = 'study' then
    update public.sessions set
      last_activity_at = case when p_away then last_activity_at else now() end,
      inactive_since = case when p_away then coalesce(inactive_since, now()) else null end
    where id = p_session and status = 'started';
  else
    update public.battery_sessions set
      last_activity_at = case when p_away then last_activity_at else now() end,
      inactive_since = case when p_away then coalesce(inactive_since, now()) else null end
    where id = p_session and status = 'started';
    update public.sessions set
      last_activity_at = case when p_away then last_activity_at else now() end,
      inactive_since = case when p_away then coalesce(inactive_since, now()) else null end
    where battery_session_id = p_session and status = 'started';
  end if;
  return 'ok';
end;
$$;
revoke all on function public.touch_participation_activity(text, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.touch_participation_activity(text, uuid, uuid, uuid, boolean) to service_role;

-- Reconcile at researcher reads; no cron configuration or global privileged sweep is required.
-- Every write is constrained to one study/battery belonging to the authenticated user's organization.
create function public.refresh_participation_activity(p_kind text, p_parent uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_kind = 'study' then
    if not public.is_org_member(public.study_org(p_parent)) then raise exception 'Study access denied' using errcode = '42501'; end if;
    update public.sessions set status = 'abandoned', abandon_reason = 'inactivity'
    where study_id = p_parent and status = 'started' and coalesce(inactive_since, last_activity_at) <= now() - interval '30 minutes';
  elsif p_kind = 'battery' then
    if not exists (select 1 from public.batteries b where b.id = p_parent and public.is_org_member(public.project_org(b.project_id))) then
      raise exception 'Battery access denied' using errcode = '42501';
    end if;
    update public.battery_sessions set status = 'abandoned', abandon_reason = 'inactivity'
    where battery_id = p_parent and status = 'started' and coalesce(inactive_since, last_activity_at) <= now() - interval '30 minutes';
    update public.sessions s set status = 'abandoned', abandon_reason = 'inactivity'
    where s.status = 'started' and exists (select 1 from public.battery_sessions b where b.id = s.battery_session_id and b.battery_id = p_parent)
      and coalesce(s.inactive_since, s.last_activity_at) <= now() - interval '30 minutes';
  else raise exception 'Invalid participation kind' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.refresh_participation_activity(text, uuid) from public, anon;
grant execute on function public.refresh_participation_activity(text, uuid) to authenticated;

-- Quotas now use last activity, not total elapsed study duration.
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
  s          public.studies%rowtype;
  n          integer;
  dup        boolean := false;
  new_id     uuid;
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

  -- Candado por dispositivo (cookie firmada con device_id).
  if s.duplicate_policy <> 'none' and p_device_id is not null then
    if exists (
      select 1 from public.sessions
      where study_id = s.id and device_id = p_device_id and status = 'completed'
    ) then
      return query select 'already_participated'::text, null::uuid;
      return;
    end if;
    -- Un intento anterior incompleto del mismo dispositivo se descarta: no se
    -- reutilizan ensayos parciales para no contaminar los tiempos de reacción.
    update public.sessions set status = 'abandoned',
      abandon_reason = case when coalesce(inactive_since, last_activity_at) <= now() - interval '30 minutes' then 'inactivity' else 'interrupted' end
    where study_id = s.id and device_id = p_device_id and status = 'started';
  end if;

  -- Límite de respuestas: completadas + en curso recientes.
  if s.max_responses is not null then
    select count(*) into n from public.sessions
    where study_id = s.id
      and (status = 'completed' or (status = 'started' and coalesce(inactive_since, last_activity_at) > now() - interval '30 minutes'));
    if n >= s.max_responses then
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

-- Completed battery steps are preserved when resuming after inactivity.
create or replace function public.claim_battery_session(
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
    where battery_id = b.id and device_id = p_device_id and (status = 'started' or (status = 'abandoned' and abandon_reason = 'inactivity'))
    order by started_at desc limit 1;
    if found then
      -- A timed-out participation must reserve capacity again before resuming.
      if b.max_responses is not null and not exists (
        select 1 from public.battery_sessions where id = sid and status = 'started'
          and coalesce(inactive_since, last_activity_at) > now() - interval '30 minutes'
      ) then
        select count(*) into n from public.battery_sessions where battery_id = b.id and id <> sid
          and (status = 'completed' or (status = 'started' and coalesce(inactive_since, last_activity_at) > now() - interval '30 minutes'));
        if n >= b.max_responses then return query select 'full'::text, null::uuid; return; end if;
      end if;
      update public.battery_sessions set status = 'started', last_activity_at = now(), inactive_since = null, abandoned_at = null, abandon_reason = null where id = sid;
      return query select 'resumed'::text, sid; return;
    end if;
  end if;

  if b.max_responses is not null then
    select count(*) into n from public.battery_sessions
    where battery_id = b.id
      and (status = 'completed' or (status = 'started' and coalesce(inactive_since, last_activity_at) > now() - interval '30 minutes'));
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
