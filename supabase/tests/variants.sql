-- Pruebas de las variantes del IAT: restricciones de estudios, claim_session, integridad y RLS.
-- Correr tras 00_stub.sql + migraciones (lo hace scripts/verify-sql.sh).

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'carla@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'diego@example.com');

insert into public.projects (id, org_id, name) values
  ('10000000-0000-0000-0000-0000000000c1',
   (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000c1'), 'Proyecto de Carla'),
  ('10000000-0000-0000-0000-0000000000d1',
   (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000d1'), 'Proyecto de Diego');

-- ---------------------------------------------------------------- restricciones de estudios
do $$
begin
  begin
    insert into public.studies (project_id, tool_type, name)
      values ('10000000-0000-0000-0000-0000000000c1', 'iat_variant', 'Variante sin liga');
    raise exception 'una variante sin access_token debería rechazarse';
  exception when check_violation then null;
  end;
end $$;

insert into public.studies (id, project_id, tool_type, name, status, config, access_token, max_responses) values
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'iat_variant', 'SC-IAT de Carla',
   'published', '{}'::jsonb, 'tok-var-carla', 2),
  ('20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'iat_variant', 'GNAT de Diego',
   'published', '{}'::jsonb, 'tok-var-diego', null);

-- ---------------------------------------------------------------- claim_session con una variante
do $$
declare
  r record;
  dev uuid := '30000000-0000-0000-0000-0000000000c1';
  sid uuid;
begin
  select * into r from public.claim_session(
    '20000000-0000-0000-0000-0000000000c1', dev, 'iphash', 'agente', '{}'::jsonb, null, 'var-v1', '[]'::jsonb,
    'keyboard', 'desktop', 1280, 800);
  if r.outcome <> 'ok' or r.new_session_id is null then
    raise exception 'claim_session debería abrir una sesión de variante, devolvió %', r.outcome;
  end if;
  sid := r.new_session_id;

  update public.sessions set status = 'completed', completed_at = now() where id = sid;
  insert into public.variant_results (session_id, study_id, variant, trials, scores, primary_value, valid, flags, engine_version)
    values (sid, '20000000-0000-0000-0000-0000000000c1', 'sc_iat', '[]'::jsonb, '{"primary":0.4}'::jsonb, 0.4, true, '{}', 'nf-iat-variants-1.0');

  select * into r from public.claim_session(
    '20000000-0000-0000-0000-0000000000c1', dev, 'iphash', 'agente', '{}'::jsonb, null, 'var-v1', '[]'::jsonb,
    'keyboard', 'desktop', 1280, 800);
  if r.outcome <> 'already_participated' then
    raise exception 'el candado debería aplicar a variantes, devolvió %', r.outcome;
  end if;

  select * into r from public.claim_session(
    '20000000-0000-0000-0000-0000000000c1', gen_random_uuid(), 'ip2', 'agente', '{}'::jsonb, null, 'var-v1', '[]'::jsonb,
    'touch', 'mobile', 390, 844);
  if r.outcome <> 'ok' then raise exception 'la segunda sesión debería abrirse, devolvió %', r.outcome; end if;
  select * into r from public.claim_session(
    '20000000-0000-0000-0000-0000000000c1', gen_random_uuid(), 'ip3', 'agente', '{}'::jsonb, null, 'var-v1', '[]'::jsonb,
    'keyboard', 'desktop', 1280, 800);
  if r.outcome <> 'full' then raise exception 'el límite debería aplicar a variantes, devolvió %', r.outcome; end if;
end $$;

-- ---------------------------------------------------------------- integridad
do $$
declare sid_carla uuid; sid_new uuid;
begin
  select id into sid_carla from public.sessions
    where study_id = '20000000-0000-0000-0000-0000000000c1' and status = 'completed' limit 1;

  begin
    insert into public.variant_results (session_id, study_id, variant, trials, scores, valid, engine_version)
      values (gen_random_uuid(), '20000000-0000-0000-0000-0000000000c1', 'gnat', '[]', '{}', true, 'x');
    raise exception 'un resultado sin sesión debería rechazarse';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.variant_results (session_id, study_id, variant, trials, scores, valid, engine_version)
      values (sid_carla, '20000000-0000-0000-0000-0000000000c1', 'sc_iat', '[]', '{}', true, 'x');
    raise exception 'un segundo resultado para la misma sesión debería rechazarse';
  exception when unique_violation then null;
  end;

  -- La variante sólo puede ser una de las tres.
  select new_session_id into sid_new from public.claim_session(
    '20000000-0000-0000-0000-0000000000d1', gen_random_uuid(), 'ipd', 'agente', '{}'::jsonb, null, 'var-v1', '[]'::jsonb,
    'keyboard', 'desktop', 1280, 800);
  begin
    insert into public.variant_results (session_id, study_id, variant, trials, scores, valid, engine_version)
      values (sid_new, '20000000-0000-0000-0000-0000000000d1', 'otra', '[]', '{}', true, 'x');
    raise exception 'una variante desconocida debería rechazarse';
  exception when check_violation then null;
  end;

  -- Una sesión de Diego no puede colgar resultados del estudio de Carla.
  begin
    insert into public.variant_results (session_id, study_id, variant, trials, scores, valid, engine_version)
      values (sid_new, '20000000-0000-0000-0000-0000000000c1', 'gnat', '[]', '{}', true, 'x');
    raise exception 'la llave compuesta debería impedir mezclar estudios';
  exception when foreign_key_violation then null;
  end;

  insert into public.variant_results (session_id, study_id, variant, trials, scores, primary_value, valid, flags, engine_version)
    values (sid_new, '20000000-0000-0000-0000-0000000000d1', 'gnat', '[]', '{"primary":1.1}', 1.1, false, '{low_discrimination}', 'nf-iat-variants-1.0');
end $$;

-- ---------------------------------------------------------------- RLS: Carla
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

do $$
declare n int;
begin
  select count(*) into n from public.variant_results;
  if n <> 1 then raise exception 'Carla debería ver sólo el resultado de su estudio (vio %)', n; end if;
  if exists (select 1 from public.variant_results where study_id = '20000000-0000-0000-0000-0000000000d1') then
    raise exception 'Carla no debería ver resultados de Diego';
  end if;
  begin
    insert into public.variant_results (session_id, study_id, variant, trials, scores, valid, engine_version)
      values (gen_random_uuid(), '20000000-0000-0000-0000-0000000000c1', 'gnat', '[]', '{}', true, 'x');
    raise exception 'authenticated no debería poder insertar resultados';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.variant_results set valid = false;
    raise exception 'authenticated no debería poder modificar resultados';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.variant_results;
    raise exception 'authenticated no debería poder borrar resultados directamente';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Carla puede borrar una sesión y eso arrastra su resultado (derecho de eliminación).
do $$
declare sid uuid;
begin
  select id into sid from public.sessions where study_id = '20000000-0000-0000-0000-0000000000c1' and status = 'completed' limit 1;
  delete from public.sessions where id = sid;
  if exists (select 1 from public.variant_results where session_id = sid) then
    raise exception 'borrar la sesión debería borrar su resultado';
  end if;
end $$;

-- ---------------------------------------------------------------- RLS: anónimo
reset role;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.variant_results;
    raise exception 'anon no debería poder leer resultados';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
select 'VARIANTS_OK' as result;
