-- Pruebas de baterías: integridad de pasos, orden, reanudación, bloqueo con respuestas,
-- borrado en cascada y RLS. Correr tras 00_stub.sql + migraciones (lo hace scripts/verify-sql.sh).

begin;

create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'beto@example.com');

insert into public.projects (id, org_id, name) values
  ('10000000-0000-0000-0000-0000000000a1', (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000a1'), 'Proyecto de Ana'),
  ('10000000-0000-0000-0000-0000000000a2', (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000a1'), 'Otro proyecto de Ana'),
  ('10000000-0000-0000-0000-0000000000b1', (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000b1'), 'Proyecto de Beto');

insert into public.studies (id, project_id, tool_type, name, status, config, access_token) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'iat',    'IAT de Ana',        'published', '{}', 'tok-iat-ana'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a1', 'survey', 'Encuesta de Ana',   'published', '{}', 'tok-sv-ana'),
  ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-0000000000a1', 'survey', 'Encuesta 2 de Ana', 'published', '{}', 'tok-sv2-ana'),
  ('20000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-0000000000a2', 'survey', 'Encuesta en otro proyecto', 'published', '{}', 'tok-sv-otro'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'survey', 'Encuesta de Beto', 'published', '{}', 'tok-sv-beto');
insert into public.studies (id, project_id, tool_type, name) values
  ('20000000-0000-0000-0000-0000000000a5', '10000000-0000-0000-0000-0000000000a1', 'seo', 'SEO de Ana');

insert into public.batteries (id, project_id, name, status, access_token, max_responses) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Batería de Ana', 'published', 'tok-bat-ana', 2),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'Batería de Beto', 'published', 'tok-bat-beto', null);

-- ---------------------------------------------------------------- guardas de los pasos
do $$
begin
  begin
    insert into public.battery_steps (battery_id, position, study_id) values ('30000000-0000-0000-0000-0000000000a1', 0, '20000000-0000-0000-0000-0000000000a5');
    raise exception 'un estudio SEO no debería poder ser un paso';
  exception when check_violation then null;
  end;
  begin
    insert into public.battery_steps (battery_id, position, study_id) values ('30000000-0000-0000-0000-0000000000a1', 0, '20000000-0000-0000-0000-0000000000a4');
    raise exception 'un estudio de otro proyecto no debería poder ser un paso';
  exception when check_violation then null;
  end;
  begin
    insert into public.battery_steps (battery_id, position, study_id) values ('30000000-0000-0000-0000-0000000000a1', 0, '20000000-0000-0000-0000-0000000000b1');
    raise exception 'un estudio de otra organización no debería poder ser un paso';
  exception when check_violation then null;
  end;
  begin
    insert into public.battery_steps (battery_id, position, study_id) values ('30000000-0000-0000-0000-0000000000a1', 0, gen_random_uuid());
    raise exception 'un estudio inexistente no debería poder ser un paso';
  exception when check_violation or foreign_key_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------- edición atómica y orden
select public.save_battery_steps('30000000-0000-0000-0000-0000000000a1',
  '[{"study_id":"20000000-0000-0000-0000-0000000000a1","enabled":true},
    {"study_id":"20000000-0000-0000-0000-0000000000a2","enabled":true},
    {"study_id":"20000000-0000-0000-0000-0000000000a3","enabled":false}]'::jsonb);

do $$
declare got text;
begin
  select string_agg(position || ':' || study_id::text || ':' || enabled, ' ' order by position) into got
  from public.battery_steps where battery_id = '30000000-0000-0000-0000-0000000000a1';
  if got is distinct from '0:20000000-0000-0000-0000-0000000000a1:true 1:20000000-0000-0000-0000-0000000000a2:true 2:20000000-0000-0000-0000-0000000000a3:false' then
    raise exception 'pasos inesperados: %', got;
  end if;
end $$;

-- Intercambiar el orden (cambia las posiciones) no choca con la llave primaria a mitad de la operación.
select public.save_battery_steps('30000000-0000-0000-0000-0000000000a1',
  '[{"study_id":"20000000-0000-0000-0000-0000000000a2","enabled":true},
    {"study_id":"20000000-0000-0000-0000-0000000000a1","enabled":true},
    {"study_id":"20000000-0000-0000-0000-0000000000a3","enabled":false}]'::jsonb);
do $$
begin
  if (select study_id from public.battery_steps where battery_id = '30000000-0000-0000-0000-0000000000a1' and position = 0) <> '20000000-0000-0000-0000-0000000000a2' then
    raise exception 'el intercambio de orden no se guardó';
  end if;
  begin
    perform public.save_battery_steps('30000000-0000-0000-0000-0000000000a1', '"no es lista"'::jsonb);
    raise exception 'p_steps que no es lista debería rechazarse';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- Vuelve al orden IAT → encuesta (la encuesta 2 queda omitida).
select public.save_battery_steps('30000000-0000-0000-0000-0000000000a1',
  '[{"study_id":"20000000-0000-0000-0000-0000000000a1","enabled":true},
    {"study_id":"20000000-0000-0000-0000-0000000000a2","enabled":true},
    {"study_id":"20000000-0000-0000-0000-0000000000a3","enabled":false}]'::jsonb);

-- ---------------------------------------------------------------- alta de sesión: orden efectivo, reanudación y candado
do $$
declare
  r record;
  dev1 uuid := '40000000-0000-0000-0000-0000000000d1';
  sid uuid;
begin
  select * into r from public.claim_battery_session('30000000-0000-0000-0000-0000000000a1', dev1, 'ip1', 'agente', 'bv-test', 'mobile');
  if r.outcome <> 'ok' then raise exception 'alta esperada ok, devolvió %', r.outcome; end if;
  sid := r.new_session_id;
  insert into ctx values ('bs1', sid);

  -- Orden efectivo: sólo los pasos activos, en su orden.
  if (select run_order from public.battery_sessions where id = sid) is distinct from
     '["20000000-0000-0000-0000-0000000000a1","20000000-0000-0000-0000-0000000000a2"]'::jsonb then
    raise exception 'run_order inesperado: %', (select run_order from public.battery_sessions where id = sid);
  end if;

  -- El mismo dispositivo con una sesión sin terminar la reanuda.
  select * into r from public.claim_battery_session('30000000-0000-0000-0000-0000000000a1', dev1, 'ip1', 'agente', 'bv-test', 'mobile');
  if r.outcome <> 'resumed' or r.new_session_id <> sid then raise exception 'se esperaba reanudar la sesión, devolvió %', r.outcome; end if;
end $$;

-- ---------------------------------------------------------------- vínculo de pasos: el servidor impone el orden
do $$
declare
  bs uuid := (select v from ctx where k = 'bs1');
  r record;
  s_iat uuid; s_sv uuid; s_sv2 uuid;
begin
  -- Se abre primero la encuesta (paso 2) sin haber completado el IAT: debe rechazarse.
  select new_session_id into s_sv from public.claim_session('20000000-0000-0000-0000-0000000000a2', '40000000-0000-0000-0000-0000000000d1', 'ip1', 'agente', '{}', null, 'x', '[]', 'touch', 'mobile', 390, 844);
  if public.link_battery_step(s_sv, bs) <> 'out_of_order' then raise exception 'la encuesta no debería poder empezar antes que el IAT'; end if;
  insert into ctx values ('s_sv', s_sv);

  -- Un estudio omitido (desactivado) no es un paso de esta sesión.
  select new_session_id into s_sv2 from public.claim_session('20000000-0000-0000-0000-0000000000a3', '40000000-0000-0000-0000-0000000000d1', 'ip1', 'agente', '{}', null, 'x', '[]', 'touch', 'mobile', 390, 844);
  if public.link_battery_step(s_sv2, bs) <> 'study_not_in_battery' then raise exception 'un paso omitido no debería poder enlazarse'; end if;

  -- Un estudio ajeno a la batería tampoco.
  declare s_otro uuid;
  begin
    select new_session_id into s_otro from public.claim_session('20000000-0000-0000-0000-0000000000a4', '40000000-0000-0000-0000-0000000000d1', 'ip1', 'agente', '{}', null, 'x', '[]', 'touch', 'mobile', 390, 844);
    if public.link_battery_step(s_otro, bs) <> 'study_not_in_battery' then raise exception 'un estudio ajeno no debería enlazarse'; end if;
  end;

  -- El primer paso sí.
  select new_session_id into s_iat from public.claim_session('20000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000d1', 'ip1', 'agente', '{}', null, 'x', '[]', 'touch', 'mobile', 390, 844);
  if public.link_battery_step(s_iat, bs) <> 'ok' then raise exception 'el primer paso debería enlazarse'; end if;
  if public.link_battery_step(s_iat, bs) <> 'ok' then raise exception 'enlazar dos veces debe ser idempotente'; end if;
  insert into ctx values ('s_iat', s_iat);

  -- Con el IAT aún sin completar, el siguiente paso sigue bloqueado.
  if public.link_battery_step(s_sv, bs) <> 'out_of_order' then raise exception 'el IAT sin completar no debería habilitar el siguiente paso'; end if;
  if public.complete_battery_session(bs) <> 'incomplete' then raise exception 'la batería no debería cerrarse con pasos pendientes'; end if;

  -- Se completa el IAT: ahora la encuesta puede enlazarse.
  update public.sessions set status = 'completed', completed_at = now() where id = s_iat;
  if public.link_battery_step(s_sv, bs) <> 'ok' then raise exception 'tras completar el IAT, la encuesta debería enlazarse'; end if;
  if public.complete_battery_session(bs) <> 'incomplete' then raise exception 'con la encuesta sin completar no debe cerrar'; end if;

  update public.sessions set status = 'completed', completed_at = now() where id = s_sv;
  if public.complete_battery_session(bs) <> 'ok' then raise exception 'con todos los pasos completos debería cerrar'; end if;
  if public.complete_battery_session(bs) <> 'ok' then raise exception 'cerrar dos veces debe ser idempotente'; end if;
  if (select status from public.battery_sessions where id = bs) <> 'completed' then raise exception 'la sesión debería quedar completada'; end if;

  -- Una sesión de batería cerrada no acepta más pasos; y inexistentes se reportan.
  if public.link_battery_step(s_sv2, bs) <> 'battery_session_closed' then raise exception 'una batería cerrada no acepta pasos'; end if;
  if public.link_battery_step(gen_random_uuid(), bs) <> 'session_not_found' then raise exception 'sesión inexistente'; end if;
  if public.link_battery_step(s_sv2, gen_random_uuid()) <> 'battery_session_not_found' then raise exception 'sesión de batería inexistente'; end if;
  if public.complete_battery_session(gen_random_uuid()) <> 'not_found' then raise exception 'complete sobre sesión inexistente'; end if;
end $$;

-- ---------------------------------------------------------------- candado y límite de respuestas (máx. 2)
do $$
declare r record;
begin
  select * into r from public.claim_battery_session('30000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000d1', 'ip1', 'agente', 'bv-test', 'mobile');
  if r.outcome <> 'already_participated' then raise exception 'el dispositivo que ya completó no debe repetir, devolvió %', r.outcome; end if;

  select * into r from public.claim_battery_session('30000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000d2', 'ip2', 'agente', 'bv-test', 'desktop');
  if r.outcome <> 'ok' then raise exception 'la segunda persona debería entrar, devolvió %', r.outcome; end if;
  insert into ctx values ('bs2', r.new_session_id);

  select * into r from public.claim_battery_session('30000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000d3', 'ip3', 'agente', 'bv-test', 'desktop');
  if r.outcome <> 'full' then raise exception 'el límite de 2 respuestas debería aplicar, devolvió %', r.outcome; end if;
end $$;

-- ---------------------------------------------------------------- con respuestas, los pasos quedan bloqueados
do $$
begin
  begin
    perform public.save_battery_steps('30000000-0000-0000-0000-0000000000a1',
      '[{"study_id":"20000000-0000-0000-0000-0000000000a2","enabled":true}]'::jsonb);
    raise exception 'no debería poder cambiarse el orden con respuestas';
  exception when check_violation then null;
  end;
  begin
    update public.battery_steps set enabled = false where battery_id = '30000000-0000-0000-0000-0000000000a1';
    raise exception 'no debería poder omitirse un paso con respuestas';
  exception when check_violation then null;
  end;
  begin
    delete from public.battery_steps where battery_id = '30000000-0000-0000-0000-0000000000a1' and position = 0;
    raise exception 'no debería poder quitarse un paso con respuestas';
  exception when check_violation then null;
  end;
  begin
    insert into public.battery_steps (battery_id, position, study_id) values ('30000000-0000-0000-0000-0000000000a1', 9, '20000000-0000-0000-0000-0000000000a4');
    raise exception 'no debería poder agregarse un paso con respuestas';
  exception when check_violation then null;
  end;
  -- Un estudio que forma parte de una batería no se borra sin quitarlo antes.
  begin
    delete from public.studies where id = '20000000-0000-0000-0000-0000000000a1';
    raise exception 'un estudio que es paso de una batería no debería poder borrarse';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------- estados de la batería
insert into public.batteries (id, project_id, name, status, access_token, closes_at) values
  ('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000a1', 'Borrador', 'draft', 'tok-bat-draft', null),
  ('30000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000a1', 'Vencida', 'published', 'tok-bat-vencida', now() - interval '1 day'),
  ('30000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-0000000000a1', 'Sin pasos', 'published', 'tok-bat-vacia', null);
do $$
declare r record;
begin
  select * into r from public.claim_battery_session('30000000-0000-0000-0000-0000000000c1', gen_random_uuid(), null, null, 'x', 'unknown');
  if r.outcome <> 'not_published' then raise exception 'borrador: %', r.outcome; end if;
  select * into r from public.claim_battery_session('30000000-0000-0000-0000-0000000000c2', gen_random_uuid(), null, null, 'x', 'unknown');
  if r.outcome <> 'closed' then raise exception 'vencida: %', r.outcome; end if;
  select * into r from public.claim_battery_session('30000000-0000-0000-0000-0000000000c3', gen_random_uuid(), null, null, 'x', 'unknown');
  if r.outcome <> 'no_steps' then raise exception 'sin pasos activos: %', r.outcome; end if;
  select * into r from public.claim_battery_session(gen_random_uuid(), gen_random_uuid(), null, null, 'x', 'unknown');
  if r.outcome <> 'not_found' then raise exception 'inexistente: %', r.outcome; end if;
end $$;

-- ---------------------------------------------------------------- RLS: Ana (sus datos) y Beto (aislamiento)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

do $$
declare n int;
begin
  select count(*) into n from public.batteries;
  if n <> 4 then raise exception 'Ana debería ver sus 4 baterías (vio %)', n; end if;
  if exists (select 1 from public.batteries where id = '30000000-0000-0000-0000-0000000000b1') then raise exception 'Ana no debe ver la batería de Beto'; end if;
  select count(*) into n from public.battery_steps; if n <> 3 then raise exception 'Ana debería ver los 3 pasos de su batería (vio %)', n; end if;
  select count(*) into n from public.battery_sessions; if n <> 2 then raise exception 'Ana debería ver sus 2 sesiones de batería (vio %)', n; end if;

  -- Puede crear baterías en su proyecto, no en el de Beto.
  insert into public.batteries (project_id, name, access_token) values ('10000000-0000-0000-0000-0000000000a1', 'Nueva de Ana', 'tok-bat-nueva');
  begin
    insert into public.batteries (project_id, name, access_token) values ('10000000-0000-0000-0000-0000000000b1', 'Intrusa', 'tok-bat-intrusa');
    raise exception 'Ana no debería crear baterías en el proyecto de Beto';
  exception when insufficient_privilege then null;
  end;

  -- Puede armar los pasos de su batería nueva, pero no de la de Beto.
  perform public.save_battery_steps((select id from public.batteries where access_token = 'tok-bat-nueva'),
    '[{"study_id":"20000000-0000-0000-0000-0000000000a2","enabled":true}]'::jsonb);
  begin
    perform public.save_battery_steps('30000000-0000-0000-0000-0000000000b1',
      '[{"study_id":"20000000-0000-0000-0000-0000000000a2","enabled":true}]'::jsonb);
    raise exception 'Ana no debería poder editar los pasos de la batería de Beto';
  exception when insufficient_privilege or check_violation then null;
  end;

  -- Las sesiones de batería las escribe el servidor: el investigador sólo puede excluirlas.
  begin
    insert into public.battery_sessions (battery_id, participant_ref) values ('30000000-0000-0000-0000-0000000000a1', 'zzz');
    raise exception 'authenticated no debería crear sesiones de batería';
  exception when insufficient_privilege then null;
  end;
  update public.battery_sessions set excluded = true, excluded_reason = 'duplicado' where id = (select v from ctx where k = 'bs2');
  begin
    update public.battery_sessions set status = 'abandoned' where id = (select v from ctx where k = 'bs2');
    raise exception 'authenticated no debería cambiar el estado de la sesión';
  exception when insufficient_privilege then null;
  end;

  -- Las funciones del participante sólo las ejecuta el servidor.
  begin
    perform public.claim_battery_session('30000000-0000-0000-0000-0000000000a1', gen_random_uuid(), null, null, 'x', 'unknown');
    raise exception 'authenticated no debería ejecutar claim_battery_session';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.link_battery_step(gen_random_uuid(), gen_random_uuid());
    raise exception 'authenticated no debería ejecutar link_battery_step';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.complete_battery_session(gen_random_uuid());
    raise exception 'authenticated no debería ejecutar complete_battery_session';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Derecho de eliminación: borrar una sesión de batería arrastra a las sesiones de sus pasos.
do $$
declare child_before int; child_after int;
begin
  select count(*) into child_before from public.sessions where battery_session_id = (select v from ctx where k = 'bs1');
  if child_before <> 2 then raise exception 'se esperaban 2 sesiones hijas de bs1 (hay %)', child_before; end if;
  delete from public.battery_sessions where id = (select v from ctx where k = 'bs1');
  select count(*) into child_after from public.sessions where id in ((select v from ctx where k = 's_iat'), (select v from ctx where k = 's_sv'));
  if child_after <> 0 then raise exception 'las sesiones hijas deberían borrarse con la sesión de batería (quedan %)', child_after; end if;
end $$;

-- ---------------------------------------------------------------- RLS: Beto
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$
begin
  if (select count(*) from public.batteries) <> 1 then raise exception 'Beto sólo debería ver su batería'; end if;
  if exists (select 1 from public.battery_steps) then raise exception 'Beto no debería ver pasos de Ana'; end if;
  if exists (select 1 from public.battery_sessions) then raise exception 'Beto no debería ver sesiones de Ana'; end if;
  delete from public.batteries where id = '30000000-0000-0000-0000-0000000000a1';  -- invisible: no borra nada
end $$;

-- ---------------------------------------------------------------- anónimo
reset role;
do $$
begin
  if not exists (select 1 from public.batteries where id = '30000000-0000-0000-0000-0000000000a1') then
    raise exception 'Beto no debería haber podido borrar la batería de Ana';
  end if;
end $$;
set local role anon;
do $$
begin
  begin perform count(*) from public.batteries; raise exception 'anon no debería leer baterías';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.battery_sessions; raise exception 'anon no debería leer sesiones de batería';
  exception when insufficient_privilege then null; end;
  begin perform public.save_battery_steps(gen_random_uuid(), '[]'::jsonb); raise exception 'anon no debería editar pasos';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------- borrar una batería con respuestas funciona (cascada) y libera los estudios
do $$
begin
  delete from public.batteries where id = '30000000-0000-0000-0000-0000000000a1';
  if exists (select 1 from public.battery_steps where battery_id = '30000000-0000-0000-0000-0000000000a1') then raise exception 'los pasos deberían borrarse con la batería'; end if;
  if exists (select 1 from public.battery_sessions where battery_id = '30000000-0000-0000-0000-0000000000a1') then raise exception 'las sesiones deberían borrarse con la batería'; end if;
  -- Ya sin batería, el estudio puede borrarse.
  delete from public.studies where id = '20000000-0000-0000-0000-0000000000a1';
end $$;

rollback;
select 'BATTERY_OK' as result;
