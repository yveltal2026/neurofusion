-- Aislamiento entre organizaciones y vínculo inseparable entre sesión y estudio.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'eva@example.com'),
  ('00000000-0000-0000-0000-0000000000e2', 'leo@example.com');
insert into public.projects (id, org_id, name) values
  ('10000000-0000-0000-0000-0000000000e1', (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000e1'), 'Eva'),
  ('10000000-0000-0000-0000-0000000000e2', (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000e2'), 'Leo');
insert into public.studies (id, project_id, tool_type, name, access_token) values
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', 'visual', 'Eye Eva', 'eye-eva'),
  ('20000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e2', 'visual', 'Eye Leo', 'eye-leo');
insert into public.sessions (id, study_id, participant_ref) values
  ('30000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', 'p1'),
  ('30000000-0000-0000-0000-0000000000e3', '20000000-0000-0000-0000-0000000000e1', 'p2'),
  ('30000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-0000000000e2', 'p1');
insert into public.eye_tracking_runs (session_id, study_id, validation, observations) values
  ('30000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1', '{}', '[{}]'),
  ('30000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-0000000000e2', '{}', '[{}]');

do $$
begin
  begin
    insert into public.eye_tracking_runs (session_id, study_id, validation, observations)
      values ('30000000-0000-0000-0000-0000000000e3', '20000000-0000-0000-0000-0000000000e2', '{}', '[{}]');
    raise exception 'una sesión no debe apuntar a otro estudio';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Webcam no se convierte en un paso de exposición sin calibración al integrar baterías.
update public.studies set config = '{"mode":"pieces","eyeTracking":{"durationSeconds":10}}'
where id = '20000000-0000-0000-0000-0000000000e1';
insert into public.batteries (id, project_id, name, access_token) values
  ('40000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', 'Batería Eva', 'battery-eva');
insert into public.battery_steps (battery_id, position, study_id) values
  ('40000000-0000-0000-0000-0000000000e1', 0, '20000000-0000-0000-0000-0000000000e1');
insert into public.battery_sessions (id, battery_id, participant_ref, run_order) values
  ('50000000-0000-0000-0000-0000000000e1', '40000000-0000-0000-0000-0000000000e1', 'p1', '["20000000-0000-0000-0000-0000000000e1"]');
do $$ declare r record; begin
  select * into r from public.start_battery_exposure('50000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1');
  assert r.outcome = 'not_exposure' and r.new_session_id is null, 'no se debe abrir una sesión de exposición para webcam';
  assert public.link_battery_step('30000000-0000-0000-0000-0000000000e3', '50000000-0000-0000-0000-0000000000e1') = 'ok', 'la medición calibrada se enlaza a la batería';
  assert (select battery_session_id from public.sessions where id = '30000000-0000-0000-0000-0000000000e3') = '50000000-0000-0000-0000-0000000000e1';
  assert public.complete_battery_exposure('50000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e3') = 'not_exposure', 'no se puede finalizar webcam por la ruta de exposición';
  assert (select status from public.sessions where id = '30000000-0000-0000-0000-0000000000e3') = 'started';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
do $$
begin
  assert (select count(*) from public.eye_tracking_runs) = 1, 'Eva sólo ve su medición';
  begin
    update public.eye_tracking_runs set validation = '{}';
    raise exception 'el investigador no debe cambiar las mediciones';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
do $$ begin
  assert (select count(*) from public.eye_tracking_runs) = 1, 'Leo sólo ve su medición';
end $$;

reset role;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.eye_tracking_runs;
    raise exception 'anon no debe leer miradas';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
select 'EYE_TRACKING_OK' as result;
