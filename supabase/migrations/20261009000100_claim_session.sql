-- Alta atómica de una sesión de participante.
--
-- Corre dentro de una transacción con el estudio bloqueado (FOR UPDATE), de modo
-- que el límite de respuestas y el candado anti-repetición no se puedan saltar con
-- peticiones simultáneas. Sólo la service role puede ejecutarla: la llama el
-- endpoint público POST /api/s/[token]/start después de validar el token.
--
-- Devuelve (outcome, new_session_id). outcome ∈
--   ok | not_found | not_published | closed | full | already_participated

create function public.claim_session(
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
    update public.sessions set status = 'abandoned'
    where study_id = s.id and device_id = p_device_id and status = 'started';
  end if;

  -- Límite de respuestas: completadas + en curso recientes.
  if s.max_responses is not null then
    select count(*) into n from public.sessions
    where study_id = s.id
      and (status = 'completed' or (status = 'started' and started_at > now() - interval '2 hours'));
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

revoke all on function public.claim_session(uuid, uuid, text, text, jsonb, text, text, jsonb, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_session(uuid, uuid, text, text, jsonb, text, text, jsonb, text, text, integer, integer)
  to service_role;
