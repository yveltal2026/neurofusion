-- NeuroFusion · baterías con todos los estudios que tienen participantes o piezas que mostrar.
--
-- Hasta ahora un paso de batería sólo podía ser un IAT o una encuesta. Ahora también:
--   * variantes del IAT (iat_variant): estudio con participantes, igual que el IAT y la encuesta; su
--     sesión se crea con claim_session y se enlaza con link_battery_step, sin cambios en esas funciones.
--   * análisis de imagen con IA (visual, modo "pieces"): paso de EXPOSICIÓN. El participante ve las
--     piezas del estudio como estímulo y continúa. No hay `claim_session` (el estudio visual no se
--     publica ni lleva liga propia): la sesión del paso la crea `start_battery_exposure`, que valida
--     el mismo orden que `link_battery_step`, y la cierra `complete_battery_exposure`.
-- SEO sigue fuera (no tiene participantes) y el modo "journey" también: es un panel modelado, sin
-- imágenes que mostrar a una persona real.

-- ============================================================ guarda de los pasos

create or replace function public.battery_steps_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  s_tool    text;
  s_project uuid;
  s_mode    text;
  b_project uuid;
begin
  select tool_type, project_id, config ->> 'mode' into s_tool, s_project, s_mode
  from public.studies where id = new.study_id;
  select project_id into b_project from public.batteries where id = new.battery_id;
  if s_tool is null or b_project is null then
    raise exception 'El estudio o la batería no existe' using errcode = '23514';
  end if;
  if s_tool not in ('iat', 'survey', 'iat_variant', 'visual') then
    raise exception 'Sólo los estudios IAT, variantes del IAT, encuesta e imagen con IA pueden ser pasos de una batería' using errcode = '23514';
  end if;
  if s_tool = 'visual' and s_mode is distinct from 'pieces' then
    raise exception 'Sólo el análisis de piezas (imagen con IA) puede ser un paso; el journey es un panel modelado' using errcode = '23514';
  end if;
  if s_project <> b_project then
    raise exception 'El estudio debe pertenecer al mismo proyecto que la batería' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ============================================================ pasos de exposición (sólo service role)

-- Abre (o retoma) la sesión de un paso de exposición. Devuelve
--   ok | session_not_found | battery_session_closed | study_not_in_battery | not_exposure | out_of_order
-- junto con el id de la sesión del paso. Idempotente: si el participante recarga la página, recibe la
-- misma sesión. Respeta el orden: el paso sólo abre si todos los anteriores de su run_order están
-- completados (misma regla que link_battery_step).
create function public.start_battery_exposure(p_battery_session uuid, p_study uuid)
returns table (outcome text, new_session_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  bs  public.battery_sessions%rowtype;
  st  public.studies%rowtype;
  pos integer;
  sid uuid;
begin
  select * into bs from public.battery_sessions where id = p_battery_session for update;
  if not found then
    return query select 'session_not_found'::text, null::uuid; return;
  end if;
  if bs.status <> 'started' then
    return query select 'battery_session_closed'::text, null::uuid; return;
  end if;

  select * into st from public.studies where id = p_study;
  if not found then
    return query select 'study_not_in_battery'::text, null::uuid; return;
  end if;

  select t.ord into pos
  from jsonb_array_elements_text(bs.run_order) with ordinality as t(study, ord)
  where t.study = p_study::text;
  if pos is null then
    return query select 'study_not_in_battery'::text, null::uuid; return;
  end if;
  if st.tool_type <> 'visual' then
    return query select 'not_exposure'::text, null::uuid; return;
  end if;

  -- Si ya tiene sesión de este paso (en curso o terminada), se devuelve la misma.
  select id into sid from public.sessions
  where battery_session_id = bs.id and study_id = p_study and status in ('started', 'completed')
  order by started_at desc limit 1;
  if found then
    return query select 'ok'::text, sid; return;
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(bs.run_order) with ordinality as t(study, ord)
    where t.ord < pos
      and not exists (
        select 1 from public.sessions c
        where c.battery_session_id = bs.id
          and c.study_id = t.study::uuid
          and c.status = 'completed'
      )
  ) then
    return query select 'out_of_order'::text, null::uuid; return;
  end if;

  insert into public.sessions (study_id, participant_ref, device_type, device_id, battery_session_id)
  values (p_study, substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), bs.device_type, bs.device_id, bs.id)
  returning id into sid;

  return query select 'ok'::text, sid;
end;
$$;

-- Cierra la sesión de un paso de exposición. Devuelve ok (idempotente) | not_found | not_exposure |
-- battery_session_closed. La sesión debe pertenecer a la sesión de batería indicada.
create function public.complete_battery_exposure(p_battery_session uuid, p_session uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  s  public.sessions%rowtype;
  bs public.battery_sessions%rowtype;
  tool text;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found or s.battery_session_id is distinct from p_battery_session then return 'not_found'; end if;
  select tool_type into tool from public.studies where id = s.study_id;
  if tool is distinct from 'visual' then return 'not_exposure'; end if;
  if s.status = 'completed' then return 'ok'; end if;
  select * into bs from public.battery_sessions where id = p_battery_session;
  if not found then return 'not_found'; end if;
  if bs.status <> 'started' or s.status <> 'started' then return 'battery_session_closed'; end if;

  update public.sessions set status = 'completed', completed_at = now() where id = s.id;
  return 'ok';
end;
$$;

revoke all on function public.start_battery_exposure(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_battery_exposure(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_battery_exposure(uuid, uuid) to service_role;
grant execute on function public.complete_battery_exposure(uuid, uuid) to service_role;
