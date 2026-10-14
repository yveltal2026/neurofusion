-- Borrado de proyectos con baterías: la cascada funciona y un estudio-paso sigue protegido.
-- Correr tras 00_stub.sql + migraciones (lo hace scripts/verify-sql.sh).

begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'dani@example.com');
insert into public.projects (id, org_id, name) values
  ('10000000-0000-0000-0000-0000000000d1',
   (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000d1'), 'Proyecto de Dani');
insert into public.studies (id, project_id, tool_type, name, status, config, access_token) values
  ('20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'iat', 'IAT', 'published', '{}'::jsonb, 'tok-d-iat'),
  ('20000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-0000000000d1', 'survey', 'Encuesta', 'published', '{}'::jsonb, 'tok-d-sv');
insert into public.batteries (id, project_id, name, status, access_token) values
  ('40000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'Batería', 'published', 'tok-d-bat');
insert into public.battery_steps (battery_id, position, study_id) values
  ('40000000-0000-0000-0000-0000000000d1', 0, '20000000-0000-0000-0000-0000000000d1'),
  ('40000000-0000-0000-0000-0000000000d1', 1, '20000000-0000-0000-0000-0000000000d2');

-- Con una sesión de batería y sesiones hijas ligadas (los datos también deben irse).
do $$
declare bs uuid;
begin
  insert into public.battery_sessions (battery_id, participant_ref) values ('40000000-0000-0000-0000-0000000000d1', 'p1') returning id into bs;
  insert into public.sessions (study_id, participant_ref, battery_session_id)
    values ('20000000-0000-0000-0000-0000000000d1', 'h1', bs), ('20000000-0000-0000-0000-0000000000d2', 'h2', bs);
end $$;

-- Un estudio que es paso no se borra por accidente (la llave es diferida: se fuerza la comprobación).
do $$
begin
  begin
    delete from public.studies where id = '20000000-0000-0000-0000-0000000000d1';
    set constraints all immediate;
    raise exception 'no debería poder borrarse un estudio que es paso de una batería';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Borrar el proyecto borra baterías, pasos, sesiones de batería, estudios y sus sesiones.
delete from public.projects where id = '10000000-0000-0000-0000-0000000000d1';

do $$
begin
  if exists (select 1 from public.batteries where project_id = '10000000-0000-0000-0000-0000000000d1') then
    raise exception 'borrar el proyecto debería borrar sus baterías';
  end if;
  if exists (select 1 from public.battery_steps where battery_id = '40000000-0000-0000-0000-0000000000d1') then
    raise exception 'quedaron pasos huérfanos';
  end if;
  if exists (select 1 from public.battery_sessions where battery_id = '40000000-0000-0000-0000-0000000000d1') then
    raise exception 'quedaron sesiones de batería';
  end if;
  if exists (select 1 from public.studies where project_id = '10000000-0000-0000-0000-0000000000d1') then
    raise exception 'quedaron estudios';
  end if;
end $$;

select 'BATTERY_CASCADE_OK' as result;
rollback;
