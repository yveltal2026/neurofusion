-- Webcam conserva su protocolo de calibración y validación independiente.
-- No se permite usar sus estudios como simples exposiciones de imagen en baterías.

create or replace function public.battery_steps_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  s_tool    text;
  s_project uuid;
  s_mode    text;
  b_project uuid;
  s_eye jsonb;
begin
  select tool_type, project_id, config ->> 'mode', config -> 'eyeTracking' into s_tool, s_project, s_mode, s_eye
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
  if s_tool = 'visual' and s_eye is not null and s_eye <> 'null'::jsonb then
    raise exception 'Los estudios de eye tracking se ejecutan por su liga propia y requieren calibración con webcam' using errcode = '23514';
  end if;
  if s_project <> b_project then
    raise exception 'El estudio debe pertenecer al mismo proyecto que la batería' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.start_battery_exposure(p_battery_session uuid, p_study uuid)
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
  if st.tool_type <> 'visual' or st.config ->> 'mode' is distinct from 'pieces'
    or (st.config -> 'eyeTracking' is not null and st.config -> 'eyeTracking' <> 'null'::jsonb) then
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
