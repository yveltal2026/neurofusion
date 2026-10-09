-- Pruebas de RLS. Correr tras 00_stub.sql + migraciones, en una BD vacía:
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/rls.sql
-- Falla (RAISE EXCEPTION) si alguna aserción no se cumple.

begin;

-- Dos investigadores. El trigger crea perfil + org personal + membresía.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@example.com');

create temp table ctx as
select
  (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-00000000000a') as org_a,
  (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-00000000000b') as org_b;
grant select on ctx to authenticated, anon;

do $$
begin
  assert (select count(*) from public.profiles) = 2, 'el trigger debe crear 2 perfiles';
  assert (select count(*) from public.organizations) = 2, 'el trigger debe crear 2 orgs personales';
end $$;

-- Datos sembrados como service role (ignora RLS): un proyecto, estudio, sesión y ensayo por org.
insert into public.projects (id, org_id, name) values
  ('10000000-0000-0000-0000-00000000000a', (select org_a from ctx), 'Proyecto de Ana'),
  ('10000000-0000-0000-0000-00000000000b', (select org_b from ctx), 'Proyecto de Beto');
insert into public.studies (id, project_id, tool_type, name, status, access_token) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'iat', 'Estudio de Ana', 'published', 'tok-a'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'iat', 'Estudio de Beto', 'published', 'tok-b');
insert into public.sessions (id, study_id, participant_ref) values
  ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'p1'),
  ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'p1');
insert into public.trials (session_id, study_id, dimension_idx, block, trial_idx, category, stimulus, correct_side, rt_ms) values
  ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 0, 3, 0, 'A', 'Marca A', 'left', 640),
  ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 0, 3, 0, 'A', 'Marca A', 'left', 700);

-- ---------------------------------------------------------------- Ana
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

do $$
declare n int;
begin
  assert (select count(*) from public.projects) = 1, 'Ana sólo ve su proyecto';
  assert (select name from public.projects) = 'Proyecto de Ana';
  assert (select count(*) from public.studies) = 1, 'Ana sólo ve su estudio';
  assert (select count(*) from public.sessions) = 1, 'Ana sólo ve su sesión';
  assert (select count(*) from public.trials) = 1, 'Ana sólo ve sus ensayos';
  assert (select count(*) from public.organizations) = 1, 'Ana sólo ve su org';
  assert (select count(*) from public.profiles) = 1, 'Ana sólo ve su perfil';

  -- Puede crear un proyecto en su org...
  insert into public.projects (org_id, name) values ((select org_a from ctx), 'Nuevo de Ana');
  assert (select count(*) from public.projects) = 2;

  -- ...pero no en la org de Beto.
  begin
    insert into public.projects (org_id, name) values ((select org_b from ctx), 'Intruso');
    raise exception 'Ana no debería poder insertar en la org de Beto';
  exception when insufficient_privilege then null;
  end;

  -- No puede crear un estudio colgado del proyecto de Beto.
  begin
    insert into public.studies (project_id, tool_type, name, access_token)
      values ('10000000-0000-0000-0000-00000000000b', 'iat', 'Intruso', 'tok-x');
    raise exception 'Ana no debería poder crear estudios en el proyecto de Beto';
  exception when insufficient_privilege then null;
  end;

  -- UPDATE/DELETE sobre filas ajenas afecta 0 filas.
  update public.projects set name = 'hack' where id = '10000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  assert n = 0, 'Ana no puede actualizar proyectos ajenos';
  delete from public.studies where id = '20000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  assert n = 0, 'Ana no puede borrar estudios ajenos';

  -- Puede excluir una sesión propia (única columna editable)...
  update public.sessions set excluded = true, excluded_reason = 'duplicado'
    where id = '30000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  assert n = 1, 'Ana puede excluir su sesión';

  -- ...pero no tocar otras columnas ni la sesión de Beto.
  begin
    update public.sessions set demographics = '{"edad": 1}' where id = '30000000-0000-0000-0000-00000000000a';
    raise exception 'Ana no debería poder editar demographics';
  exception when insufficient_privilege then null;
  end;
  update public.sessions set excluded = true where id = '30000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  assert n = 0, 'Ana no puede excluir sesiones ajenas';

  -- Ensayos y resultados: sólo lectura.
  begin
    insert into public.trials (session_id, study_id, dimension_idx, block, trial_idx, category, stimulus, correct_side, rt_ms)
      values ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 0, 3, 99, 'A', 'x', 'left', 1);
    raise exception 'Ana no debería poder insertar ensayos';
  exception when insufficient_privilege then null;
  end;

  -- Análisis: puede guardar en su estudio, no en el ajeno.
  insert into public.analyses (study_id, n_sessions, provider, model, aggregates, result)
    values ('20000000-0000-0000-0000-00000000000a', 1, 'anthropic', 'm', '{}', '{}');
  begin
    insert into public.analyses (study_id, n_sessions, provider, model, aggregates, result)
      values ('20000000-0000-0000-0000-00000000000b', 1, 'anthropic', 'm', '{}', '{}');
    raise exception 'Ana no debería poder guardar análisis en estudio ajeno';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- Beto
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$
begin
  assert (select count(*) from public.projects) = 1, 'Beto sólo ve su proyecto (no el nuevo de Ana)';
  assert (select name from public.projects) = 'Proyecto de Beto';
  assert (select count(*) from public.analyses) = 0, 'Beto no ve análisis de Ana';
  assert (select excluded from public.sessions) = false, 'la sesión de Beto no se tocó';
end $$;

-- ---------------------------------------------------------------- anónimo
reset role;
set local role anon;
reset request.jwt.claim.sub;
do $$
begin
  begin
    perform count(*) from public.studies;
    raise exception 'anon no debería poder leer estudios';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.sessions;
    raise exception 'anon no debería poder leer sesiones';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- service role
reset role;
set local role service_role;
do $$
begin
  assert (select count(*) from public.sessions) = 2, 'service_role ve todo (ignora RLS)';
  insert into public.session_results (session_id, study_id, dimension_idx, first_combo, d_score, error_rate, fast_fraction, n_used, n_trials, valid)
    values ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 0, 'A_with_P1', 0.4, 0.05, 0, 100, 200, true);
end $$;

-- Cascada: borrar un estudio elimina sesiones, ensayos y resultados.
reset role;
delete from public.studies where id = '20000000-0000-0000-0000-00000000000a';
do $$
begin
  assert (select count(*) from public.sessions where study_id = '20000000-0000-0000-0000-00000000000a') = 0;
  assert (select count(*) from public.trials where study_id = '20000000-0000-0000-0000-00000000000a') = 0;
  assert (select count(*) from public.session_results where study_id = '20000000-0000-0000-0000-00000000000a') = 0;
end $$;

rollback;
select 'RLS_OK' as result;
