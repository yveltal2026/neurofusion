-- Pruebas del compositor de sesión (baterías): integridad de pasos, claim_battery_session, RLS y cascadas.
-- Correr tras 00_stub.sql + migraciones (lo hace scripts/verify-sql.sh).

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'bea@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'carlos@example.com');

insert into public.projects (id, org_id, name) values
  ('10000000-0000-0000-0000-0000000000b1',
   (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000b1'), 'Proyecto de Bea'),
  ('10000000-0000-0000-0000-0000000000b2',
   (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000b1'), 'Otro proyecto de Bea'),
  ('10000000-0000-0000-0000-0000000000c1',
   (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000c1'), 'Proyecto de Carlos');

insert into public.studies (id, project_id, tool_type, name, status, config, access_token) values
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'iat',    'IAT de Bea',      'published', '{}'::jsonb, 'tok-iat-bea'),
  ('20000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-0000000000b1', 'survey', 'Encuesta de Bea', 'published', '{}'::jsonb, 'tok-sv-bea'),
  ('20000000-0000-0000-0000-0000000000b3', '10000000-0000-0000-0000-0000000000b2', 'survey', 'Encuesta en otro proyecto', 'published', '{}'::jsonb, 'tok-sv-bea2'),
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'survey', 'Encuesta de Carlos', 'published', '{}'::jsonb, 'tok-sv-carlos');
insert into public.studies (id, project_id, tool_type, name) values
  ('20000000-0000-0000-0000-0000000000b9', '10000000-0000-0000-0000-0000000000b1', 'seo', 'SEO de Bea');

insert into public.batteries (id, project_id, name, status, access_token, max_responses) values
  ('40000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'Batería de Bea', 'published', 'tok-bat-bea', 2),
  ('40000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'Batería de Carlos', 'published', 'tok-bat-carlos', null);

-- ---------------------------------------------------------------- integridad de los pasos
insert into public.battery_steps (battery_id, position, study_id) values
  ('40000000-0000-0000-0000-0000000000b1', 0, '20000000-0000-0000-0000-0000000000b1'),
  ('40000000-0000-0000-0000-0000000000b1', 1, '20000000-0000-0000-0000-0000000000b2');

do $$
begin
  begin
    insert into public.battery_steps (battery_id, position, study_id)
      values ('40000000-0000-0000-0000-0000000000b1', 2, '20000000-0000-0000-0000-0000000000b9');
    raise exception 'un estudio SEO no debería poder ser paso de una batería';
  exception when check_violation then null;
  end;
  begin
    insert into public.battery_steps (battery_id, position, study_id)
      values ('40000000-0000-0000-0000-0000000000b1', 2, '20000000-0000-0000-0000-0000000000b3');
    raise exception 'un estudio de otro proyecto no debería poder ser paso';
  exception when check_violation then null;
  end;
  begin
    insert into public.battery_steps (battery_id, position, study_id)
      values ('40000000-0000-0000-0000-0000000000b1', 2, '20000000-0000-0000-0000-0000000000b1');
    raise exception 'el mismo estudio no debería repetirse en una batería';
  exception when unique_violation then null;
  end;
  begin
    insert into public.battery_steps (battery_id, position, study_id)
      values ('40000000-0000-0000-0000-0000000000b1', 1, '20000000-0000-0000-0000-0000000000b9');
    raise exception 'dos pasos en la misma posición deberían rechazarse';
  exception when check_violation or unique_violation then null;
  end;
  begin
    insert into public.batteries (project_id, name, access_token) values ('10000000-0000-0000-0000-0000000000b1', '', 'tok-x');
    raise exception 'una batería sin nombre debería rechazarse';
  exception when check_violation then null;
  end;
  begin
    insert into public.batteries (project_id, name, access_token) values ('10000000-0000-0000-0000-0000000000b1', 'Repetida', 'tok-bat-bea');
    raise exception 'un token repetido debería rechazarse';
  exception when unique_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------- claim_battery_session
do $$
declare
  r record;
  dev uuid := '50000000-0000-0000-0000-0000000000b1';
  sid uuid;
  child uuid;
begin
  select * into r from public.claim_battery_session(
    '40000000-0000-0000-0000-0000000000b1', dev, 'iph', 'agente', 'bat-v1', 'desktop',
    '["20000000-0000-0000-0000-0000000000b1","20000000-0000-0000-0000-0000000000b2"]'::jsonb);
  if r.outcome <> 'ok' or r.new_session_id is null then raise exception 'debería abrir sesión, devolvió %', r.outcome; end if;
  sid := r.new_session_id;
  if (select jsonb_array_length(run_order) from public.battery_sessions where id = sid) <> 2 then
    raise exception 'debería guardar el orden corrido';
  end if;

  -- Reintento del mismo dispositivo con la sesión incompleta: la anterior queda abandonada.
  select * into r from public.claim_battery_session(
    '40000000-0000-0000-0000-0000000000b1', dev, 'iph', 'agente', 'bat-v1', 'desktop', '[]'::jsonb);
  if r.outcome <> 'ok' then raise exception 'reintento esperado ok, devolvió %', r.outcome; end if;
  if (select status from public.battery_sessions where id = sid) <> 'abandoned' then
    raise exception 'la sesión incompleta anterior debería quedar abandonada';
  end if;
  sid := r.new_session_id;

  -- Una sesión hija enlazada a la de batería; al completar la de batería, el mismo dispositivo ya no puede repetir.
  insert into public.sessions (study_id, participant_ref, battery_session_id, device_type)
    values ('20000000-0000-0000-0000-0000000000b2', 'hija1', sid, 'desktop') returning id into child;
  update public.battery_sessions set status = 'completed', completed_at = now() where id = sid;
  select * into r from public.claim_battery_session(
    '40000000-0000-0000-0000-0000000000b1', dev, 'iph', 'agente', 'bat-v1', 'desktop', '[]'::jsonb);
  if r.outcome <> 'already_participated' then raise exception 'el candado debería aplicar, devolvió %', r.outcome; end if;

  -- Límite (max 2): un segundo dispositivo entra; el tercero ya no.
  select * into r from public.claim_battery_session(
    '40000000-0000-0000-0000-0000000000b1', gen_random_uuid(), 'ip2', 'agente', 'bat-v1', 'mobile', '[]'::jsonb);
  if r.outcome <> 'ok' then raise exception 'la segunda sesión debería abrirse, devolvió %', r.outcome; end if;
  select * into r from public.claim_battery_session(
    '40000000-0000-0000-0000-0000000000b1', gen_random_uuid(), 'ip3', 'agente', 'bat-v1', 'mobile', '[]'::jsonb);
  if r.outcome <> 'full' then raise exception 'el límite debería aplicar, devolvió %', r.outcome; end if;

  -- Estado de la batería.
  update public.batteries set status = 'draft' where id = '40000000-0000-0000-0000-0000000000b1';
  select * into r from public.claim_battery_session(
    '40000000-0000-0000-0000-0000000000b1', gen_random_uuid(), null, null, 'v', 'desktop', '[]'::jsonb);
  if r.outcome <> 'not_published' then raise exception 'un borrador no debería aceptar, devolvió %', r.outcome; end if;
  update public.batteries set status = 'published', closes_at = now() - interval '1 minute' where id = '40000000-0000-0000-0000-0000000000b1';
  select * into r from public.claim_battery_session(
    '40000000-0000-0000-0000-0000000000b1', gen_random_uuid(), null, null, 'v', 'desktop', '[]'::jsonb);
  if r.outcome <> 'closed' then raise exception 'una batería vencida no debería aceptar, devolvió %', r.outcome; end if;
  update public.batteries set closes_at = null where id = '40000000-0000-0000-0000-0000000000b1';
  select * into r from public.claim_battery_session(gen_random_uuid(), null, null, null, 'v', 'desktop', '[]'::jsonb);
  if r.outcome <> 'not_found' then raise exception 'una batería inexistente debería devolver not_found, devolvió %', r.outcome; end if;

  -- Cascada: borrar la sesión de batería borra la sesión hija.
  delete from public.battery_sessions where id = sid;
  if exists (select 1 from public.sessions where id = child) then
    raise exception 'borrar la sesión de batería debería borrar la sesión hija';
  end if;
end $$;

-- ---------------------------------------------------------------- RLS
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

do $$
begin
  if (select count(*) from public.batteries) <> 1 then raise exception 'Bea sólo debería ver su batería'; end if;
  if (select count(*) from public.battery_steps) <> 2 then raise exception 'Bea debería ver sus 2 pasos'; end if;
  if (select count(*) from public.battery_sessions) < 1 then raise exception 'Bea debería ver las sesiones de su batería'; end if;

  -- Puede crear baterías y pasos en su proyecto, pero no en el de Carlos.
  insert into public.batteries (project_id, name, access_token) values ('10000000-0000-0000-0000-0000000000b2', 'Nueva', 'tok-nueva');
  begin
    insert into public.batteries (project_id, name, access_token) values ('10000000-0000-0000-0000-0000000000c1', 'Intrusa', 'tok-intrusa');
    raise exception 'Bea no debería crear baterías en el proyecto de Carlos';
  exception when insufficient_privilege then null;
  end;

  -- Sólo puede cambiar excluded/excluded_reason de las sesiones; no insertarlas.
  update public.battery_sessions set excluded = true, excluded_reason = 'duplicado';
  begin
    update public.battery_sessions set status = 'completed';
    raise exception 'el investigador no debería poder cambiar el estado de la sesión';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.battery_sessions (battery_id, participant_ref) values ('40000000-0000-0000-0000-0000000000b1', 'falsa');
    raise exception 'el investigador no debería poder crear sesiones de batería';
  exception when insufficient_privilege then null;
  end;

  -- No puede ejecutar la función de alta.
  begin
    perform * from public.claim_battery_session('40000000-0000-0000-0000-0000000000b1', null, null, null, 'v', 'desktop', '[]'::jsonb);
    raise exception 'un usuario no debería ejecutar claim_battery_session';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
begin
  if (select count(*) from public.batteries) <> 1 then raise exception 'Carlos sólo debería ver su batería'; end if;
  if (select count(*) from public.battery_steps) <> 0 then raise exception 'Carlos no debería ver pasos de Bea'; end if;
  if (select count(*) from public.battery_sessions) <> 0 then raise exception 'Carlos no debería ver sesiones de Bea'; end if;
  update public.batteries set name = 'hackeada' where id = '40000000-0000-0000-0000-0000000000b1';
  if (select name from public.batteries where id = '40000000-0000-0000-0000-0000000000c1') = 'hackeada' then raise exception 'update cruzado'; end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform count(*) from public.batteries;
    raise exception 'anon no debería leer baterías';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- ---------------------------------------------------------------- borrados
do $$
begin
  -- Un estudio que es paso de una batería no se borra por accidente.
  begin
    delete from public.studies where id = '20000000-0000-0000-0000-0000000000b1';
    set constraints all immediate; -- la llave es diferida: fuerza la comprobación
    raise exception 'no debería poder borrarse un estudio que es paso de una batería';
  exception when foreign_key_violation then null;
  end;
  -- Quitar el paso lo libera.
  delete from public.battery_steps where study_id = '20000000-0000-0000-0000-0000000000b1';
  delete from public.studies where id = '20000000-0000-0000-0000-0000000000b1';
  -- Borrar un proyecto con baterías y estudios y pasos funciona (misma sentencia).
  delete from public.projects where id = '10000000-0000-0000-0000-0000000000b1';
  if exists (select 1 from public.batteries where project_id = '10000000-0000-0000-0000-0000000000b1') then
    raise exception 'borrar el proyecto debería borrar sus baterías';
  end if;
end $$;

select 'BATTERY_OK' as result;
rollback;
