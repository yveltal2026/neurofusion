-- Pruebas de baterías con todos los tipos de paso: variantes del IAT e imagen con IA (exposición).
-- Correr tras 00_stub.sql + migraciones (lo hace scripts/verify-sql.sh).

begin;

create temp table ctx (k text primary key, v uuid);
grant all on ctx to public;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'carla@example.com');

insert into public.projects (id, org_id, name) values
  ('10000000-0000-0000-0000-0000000000c1', (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000c1'), 'Proyecto de Carla'),
  ('10000000-0000-0000-0000-0000000000c2', (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000c1'), 'Otro proyecto de Carla');

insert into public.studies (id, project_id, tool_type, name, status, config, access_token) values
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'iat',         'IAT',        'published', '{}', 'tok-iat-c'),
  ('20000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', 'iat_variant', 'Variante',   'published', '{}', 'tok-var-c'),
  ('20000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-0000000000c1', 'survey',      'Encuesta',   'published', '{}', 'tok-sv-c');
insert into public.studies (id, project_id, tool_type, name, config) values
  ('20000000-0000-0000-0000-0000000000c4', '10000000-0000-0000-0000-0000000000c1', 'visual', 'Piezas',  '{"mode":"pieces"}'),
  ('20000000-0000-0000-0000-0000000000c5', '10000000-0000-0000-0000-0000000000c1', 'visual', 'Journey', '{"mode":"journey"}'),
  ('20000000-0000-0000-0000-0000000000c6', '10000000-0000-0000-0000-0000000000c2', 'visual', 'Piezas en otro proyecto', '{"mode":"pieces"}'),
  ('20000000-0000-0000-0000-0000000000c7', '10000000-0000-0000-0000-0000000000c1', 'seo',    'SEO', '{}');

insert into public.batteries (id, project_id, name, status, access_token) values
  ('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'Batería completa', 'published', 'tok-bat-c');

-- ---------------------------------------------------------------- guarda: qué estudios pueden ser paso
do $$
begin
  -- Se aceptan variantes y piezas visuales.
  insert into public.battery_steps (battery_id, position, study_id) values
    ('30000000-0000-0000-0000-0000000000c1', 0, '20000000-0000-0000-0000-0000000000c2');
  insert into public.battery_steps (battery_id, position, study_id) values
    ('30000000-0000-0000-0000-0000000000c1', 1, '20000000-0000-0000-0000-0000000000c4');
  delete from public.battery_steps where battery_id = '30000000-0000-0000-0000-0000000000c1';

  begin
    insert into public.battery_steps (battery_id, position, study_id) values ('30000000-0000-0000-0000-0000000000c1', 0, '20000000-0000-0000-0000-0000000000c5');
    raise exception 'un journey no debería poder ser un paso';
  exception when check_violation then null;
  end;
  begin
    insert into public.battery_steps (battery_id, position, study_id) values ('30000000-0000-0000-0000-0000000000c1', 0, '20000000-0000-0000-0000-0000000000c7');
    raise exception 'un estudio SEO no debería poder ser un paso';
  exception when check_violation then null;
  end;
  begin
    insert into public.battery_steps (battery_id, position, study_id) values ('30000000-0000-0000-0000-0000000000c1', 0, '20000000-0000-0000-0000-0000000000c6');
    raise exception 'unas piezas de otro proyecto no deberían poder ser un paso';
  exception when check_violation then null;
  end;
end $$;

-- Orden: IAT → exposición (piezas) → variante → encuesta.
select public.save_battery_steps('30000000-0000-0000-0000-0000000000c1',
  '[{"study_id":"20000000-0000-0000-0000-0000000000c1","enabled":true},
    {"study_id":"20000000-0000-0000-0000-0000000000c4","enabled":true},
    {"study_id":"20000000-0000-0000-0000-0000000000c2","enabled":true},
    {"study_id":"20000000-0000-0000-0000-0000000000c3","enabled":true}]'::jsonb);

-- ---------------------------------------------------------------- recorrido completo
do $$
declare
  dev uuid := '40000000-0000-0000-0000-0000000000e1';
  r record;
  bs uuid; s_iat uuid; s_exp uuid; s_exp2 uuid; s_var uuid; s_sv uuid;
begin
  select * into r from public.claim_battery_session('30000000-0000-0000-0000-0000000000c1', dev, 'ip', 'agente', 'bv', 'mobile');
  if r.outcome <> 'ok' then raise exception 'alta esperada ok, devolvió %', r.outcome; end if;
  bs := r.new_session_id;

  -- La exposición no abre antes que el IAT.
  select * into r from public.start_battery_exposure(bs, '20000000-0000-0000-0000-0000000000c4');
  if r.outcome <> 'out_of_order' or r.new_session_id is not null then raise exception 'la exposición no debería abrir antes que el IAT: %', r.outcome; end if;

  -- IAT completado.
  select new_session_id into s_iat from public.claim_session('20000000-0000-0000-0000-0000000000c1', dev, 'ip', 'agente', '{}', null, 'x', '[]', 'touch', 'mobile', 390, 844);
  if public.link_battery_step(s_iat, bs) <> 'ok' then raise exception 'el IAT debería enlazarse'; end if;
  update public.sessions set status = 'completed', completed_at = now() where id = s_iat;

  -- Una variante no abre antes que la exposición (el orden manda aunque no sea exposición).
  select new_session_id into s_var from public.claim_session('20000000-0000-0000-0000-0000000000c2', dev, 'ip', 'agente', '{}', null, 'x', '[]', 'touch', 'mobile', 390, 844);
  if public.link_battery_step(s_var, bs) <> 'out_of_order' then raise exception 'la variante no debería abrir antes que la exposición'; end if;

  -- Un estudio que no es de exposición no se abre por esta vía; uno ajeno a la batería, tampoco.
  select * into r from public.start_battery_exposure(bs, '20000000-0000-0000-0000-0000000000c3');
  if r.outcome <> 'not_exposure' then raise exception 'la encuesta no es exposición: %', r.outcome; end if;
  select * into r from public.start_battery_exposure(bs, '20000000-0000-0000-0000-0000000000c6');
  if r.outcome <> 'study_not_in_battery' then raise exception 'piezas ajenas: %', r.outcome; end if;
  select * into r from public.start_battery_exposure(gen_random_uuid(), '20000000-0000-0000-0000-0000000000c4');
  if r.outcome <> 'session_not_found' then raise exception 'sesión inexistente: %', r.outcome; end if;

  -- Exposición: abre, es idempotente (recarga) y se cierra una sola vez.
  select * into r from public.start_battery_exposure(bs, '20000000-0000-0000-0000-0000000000c4');
  if r.outcome <> 'ok' then raise exception 'la exposición debería abrir: %', r.outcome; end if;
  s_exp := r.new_session_id;
  select * into r from public.start_battery_exposure(bs, '20000000-0000-0000-0000-0000000000c4');
  if r.outcome <> 'ok' or r.new_session_id <> s_exp then raise exception 'recargar debe devolver la misma sesión'; end if;
  if (select count(*) from public.sessions where study_id = '20000000-0000-0000-0000-0000000000c4') <> 1 then
    raise exception 'recargar no debe crear sesiones nuevas';
  end if;
  if (select battery_session_id from public.sessions where id = s_exp) <> bs then raise exception 'la sesión debe quedar enlazada a la batería'; end if;

  -- Sin completar la exposición, la variante sigue bloqueada.
  if public.link_battery_step(s_var, bs) <> 'out_of_order' then raise exception 'la variante debe esperar a que termine la exposición'; end if;

  -- Cerrar con una sesión de batería equivocada no funciona.
  if public.complete_battery_exposure(gen_random_uuid(), s_exp) <> 'not_found' then raise exception 'complete con batería ajena debería fallar'; end if;
  -- Ni una sesión de otro tipo de estudio.
  if public.complete_battery_exposure(bs, s_iat) <> 'not_exposure' then raise exception 'complete sobre un IAT debería fallar'; end if;

  if public.complete_battery_exposure(bs, s_exp) <> 'ok' then raise exception 'la exposición debería cerrarse'; end if;
  if public.complete_battery_exposure(bs, s_exp) <> 'ok' then raise exception 'cerrar dos veces debe ser idempotente'; end if;
  if (select status from public.sessions where id = s_exp) <> 'completed' or (select completed_at from public.sessions where id = s_exp) is null then
    raise exception 'la sesión de exposición debe quedar completada';
  end if;
  -- Abrir de nuevo tras completar devuelve la misma sesión, no una nueva.
  select * into r from public.start_battery_exposure(bs, '20000000-0000-0000-0000-0000000000c4');
  if r.outcome <> 'ok' or r.new_session_id <> s_exp then raise exception 'tras completar debe devolver la sesión existente'; end if;

  -- Ahora la variante (con la misma sesión ya creada) sí enlaza y se completa; luego la encuesta.
  if public.link_battery_step(s_var, bs) <> 'ok' then raise exception 'la variante debería enlazarse tras la exposición'; end if;
  update public.sessions set status = 'completed', completed_at = now() where id = s_var;

  if public.complete_battery_session(bs) <> 'incomplete' then raise exception 'falta la encuesta: la batería no debe cerrar'; end if;
  select new_session_id into s_sv from public.claim_session('20000000-0000-0000-0000-0000000000c3', dev, 'ip', 'agente', '{}', null, 'x', '[]', 'touch', 'mobile', 390, 844);
  if public.link_battery_step(s_sv, bs) <> 'ok' then raise exception 'la encuesta debería enlazarse'; end if;
  update public.sessions set status = 'completed', completed_at = now() where id = s_sv;
  if public.complete_battery_session(bs) <> 'ok' then raise exception 'con los cuatro pasos completos la batería debe cerrar'; end if;

  -- Cerrada la batería, no se abren ni cierran exposiciones.
  select * into r from public.start_battery_exposure(bs, '20000000-0000-0000-0000-0000000000c4');
  if r.outcome <> 'battery_session_closed' then raise exception 'batería cerrada: %', r.outcome; end if;
end $$;

-- ---------------------------------------------------------------- privilegios: sólo la service role
do $$
begin
  if has_function_privilege('authenticated', 'public.start_battery_exposure(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.start_battery_exposure(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.complete_battery_exposure(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.complete_battery_exposure(uuid, uuid)', 'execute') then
    raise exception 'las funciones de exposición no deben ser ejecutables por anon ni authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.start_battery_exposure(uuid, uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.complete_battery_exposure(uuid, uuid)', 'execute') then
    raise exception 'la service role debe poder ejecutarlas';
  end if;
end $$;

rollback;
select 'BATTERY_TOOLS_OK';
