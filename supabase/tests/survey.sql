-- Pruebas de la herramienta Encuesta: restricciones, claim_session con una encuesta, RLS e integridad.
-- Correr tras 00_stub.sql + migraciones (lo hace scripts/verify-sql.sh).

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'elena@example.com'),
  ('00000000-0000-0000-0000-0000000000f1', 'felipe@example.com');

insert into public.projects (id, org_id, name) values
  ('10000000-0000-0000-0000-0000000000e1',
   (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000e1'), 'Proyecto de Elena'),
  ('10000000-0000-0000-0000-0000000000f1',
   (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1'), 'Proyecto de Felipe');

-- ---------------------------------------------------------------- restricciones de estudios
do $$
begin
  begin
    insert into public.studies (project_id, tool_type, name)
      values ('10000000-0000-0000-0000-0000000000e1', 'survey', 'Encuesta sin liga');
    raise exception 'una encuesta sin access_token debería rechazarse';
  exception when check_violation then null;
  end;
  begin
    insert into public.studies (project_id, tool_type, name, access_token)
      values ('10000000-0000-0000-0000-0000000000e1', 'iat', 'IAT sin liga', null);
    raise exception 'un IAT sin access_token debería rechazarse';
  exception when check_violation then null;
  end;
  begin
    insert into public.studies (project_id, tool_type, name, access_token)
      values ('10000000-0000-0000-0000-0000000000e1', 'eyetracking', 'x', 'tok-x');
    raise exception 'un tool_type desconocido debería rechazarse';
  exception when check_violation then null;
  end;
end $$;

-- SEO y visual siguen sin necesitar liga.
insert into public.studies (id, project_id, tool_type, name) values
  ('20000000-0000-0000-0000-0000000000e9', '10000000-0000-0000-0000-0000000000e1', 'seo', 'SEO de Elena');

insert into public.studies (id, project_id, tool_type, name, status, config, access_token, max_responses) values
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', 'survey', 'Encuesta de Elena',
   'published', '{}'::jsonb, 'tok-survey-elena', 2),
  ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'survey', 'Encuesta de Felipe',
   'published', '{}'::jsonb, 'tok-survey-felipe', null);

-- ---------------------------------------------------------------- claim_session con una encuesta (valores neutros del IAT)
do $$
declare
  r record;
  dev uuid := '30000000-0000-0000-0000-0000000000e1';
  sid uuid;
begin
  select * into r from public.claim_session(
    '20000000-0000-0000-0000-0000000000e1', dev, 'iphash', 'agente', '{}'::jsonb, null, 'survey-v1', '[]'::jsonb,
    'touch', 'mobile', 390, 844);
  if r.outcome <> 'ok' or r.new_session_id is null then
    raise exception 'claim_session debería abrir una sesión de encuesta, devolvió %', r.outcome;
  end if;
  sid := r.new_session_id;

  -- Mismo dispositivo, sesión aún sin completar: se descarta la anterior y se abre otra.
  select * into r from public.claim_session(
    '20000000-0000-0000-0000-0000000000e1', dev, 'iphash', 'agente', '{}'::jsonb, null, 'survey-v1', '[]'::jsonb,
    'touch', 'mobile', 390, 844);
  if r.outcome <> 'ok' then raise exception 'reintento esperado ok, devolvió %', r.outcome; end if;
  if (select status from public.sessions where id = sid) <> 'abandoned' then
    raise exception 'la sesión incompleta anterior debería quedar abandonada';
  end if;
  sid := r.new_session_id;

  -- Completa y guarda las respuestas (como lo haría la service role).
  update public.sessions set status = 'completed', completed_at = now() where id = sid;
  insert into public.survey_answers (session_id, study_id, answers, scores, engine_version)
    values (sid, '20000000-0000-0000-0000-0000000000e1', '{"nps_1": 9}'::jsonb,
            '[{"blockId":"nps","instrumentId":"nps","score":{"instrument":"nps","value":9,"category":"promoter"}}]'::jsonb,
            'nf-survey-1.0');

  -- Candado: el mismo dispositivo ya participó.
  select * into r from public.claim_session(
    '20000000-0000-0000-0000-0000000000e1', dev, 'iphash', 'agente', '{}'::jsonb, null, 'survey-v1', '[]'::jsonb,
    'touch', 'mobile', 390, 844);
  if r.outcome <> 'already_participated' then
    raise exception 'el candado debería aplicar a encuestas, devolvió %', r.outcome;
  end if;

  -- Límite de respuestas (max 2): otro dispositivo entra, el siguiente ya no.
  select * into r from public.claim_session(
    '20000000-0000-0000-0000-0000000000e1', gen_random_uuid(), 'ip2', 'agente', '{}'::jsonb, null, 'survey-v1', '[]'::jsonb,
    'keyboard', 'desktop', 1280, 800);
  if r.outcome <> 'ok' then raise exception 'la segunda sesión debería abrirse, devolvió %', r.outcome; end if;
  select * into r from public.claim_session(
    '20000000-0000-0000-0000-0000000000e1', gen_random_uuid(), 'ip3', 'agente', '{}'::jsonb, null, 'survey-v1', '[]'::jsonb,
    'keyboard', 'desktop', 1280, 800);
  if r.outcome <> 'full' then raise exception 'el límite debería aplicar a encuestas, devolvió %', r.outcome; end if;
end $$;

-- ---------------------------------------------------------------- integridad
do $$
declare sid_elena uuid;
begin
  select id into sid_elena from public.sessions
    where study_id = '20000000-0000-0000-0000-0000000000e1' and status = 'completed' limit 1;

  -- Una respuesta no puede declarar otro estudio distinto al de su sesión.
  begin
    insert into public.survey_answers (session_id, study_id, answers, engine_version)
      values (gen_random_uuid(), '20000000-0000-0000-0000-0000000000e1', '{}'::jsonb, 'nf-survey-1.0');
    raise exception 'una respuesta sin sesión debería rechazarse';
  exception when foreign_key_violation then null;
  end;

  -- Sólo una respuesta por sesión.
  begin
    insert into public.survey_answers (session_id, study_id, answers, engine_version)
      values (sid_elena, '20000000-0000-0000-0000-0000000000e1', '{}'::jsonb, 'nf-survey-1.0');
    raise exception 'una segunda respuesta para la misma sesión debería rechazarse';
  exception when unique_violation then null;
  end;
end $$;

-- Una sesión de Elena no puede colgar respuestas de otro estudio.
do $$
declare sid_new uuid;
begin
  select new_session_id into sid_new from public.claim_session(
    '20000000-0000-0000-0000-0000000000f1', gen_random_uuid(), 'ipf', 'agente', '{}'::jsonb, null, 'survey-v1', '[]'::jsonb,
    'keyboard', 'desktop', 1280, 800);
  begin
    insert into public.survey_answers (session_id, study_id, answers, engine_version)
      values (sid_new, '20000000-0000-0000-0000-0000000000e1', '{}'::jsonb, 'nf-survey-1.0');
    raise exception 'la llave compuesta debería impedir mezclar estudios';
  exception when foreign_key_violation then null;
  end;
  insert into public.survey_answers (session_id, study_id, answers, engine_version)
    values (sid_new, '20000000-0000-0000-0000-0000000000f1', '{"nps_1": 4}'::jsonb, 'nf-survey-1.0');
end $$;

-- ---------------------------------------------------------------- RLS: Elena
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';

do $$
declare n int;
begin
  select count(*) into n from public.survey_answers;
  if n <> 1 then raise exception 'Elena debería ver sólo la respuesta de su encuesta (vio %)', n; end if;
  if exists (select 1 from public.survey_answers where study_id = '20000000-0000-0000-0000-0000000000f1') then
    raise exception 'Elena no debería ver respuestas de Felipe';
  end if;

  -- El investigador no escribe respuestas (las escribe el servidor).
  begin
    insert into public.survey_answers (session_id, study_id, answers, engine_version)
      values (gen_random_uuid(), '20000000-0000-0000-0000-0000000000e1', '{}'::jsonb, 'x');
    raise exception 'authenticated no debería poder insertar respuestas';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.survey_answers set answers = '{}'::jsonb;
    raise exception 'authenticated no debería poder modificar respuestas';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.survey_answers;
    raise exception 'authenticated no debería poder borrar respuestas directamente';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Elena puede borrar una sesión y eso arrastra sus respuestas (derecho de eliminación).
do $$
declare sid uuid;
begin
  select id into sid from public.sessions where study_id = '20000000-0000-0000-0000-0000000000e1' and status = 'completed' limit 1;
  delete from public.sessions where id = sid;
  if exists (select 1 from public.survey_answers where session_id = sid) then
    raise exception 'borrar la sesión debería borrar sus respuestas';
  end if;
end $$;

-- ---------------------------------------------------------------- RLS: anónimo
reset role;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.survey_answers;
    raise exception 'anon no debería poder leer respuestas';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
select 'SURVEY_OK' as result;
