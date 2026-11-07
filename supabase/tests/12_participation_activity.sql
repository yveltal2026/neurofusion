-- Presence, timeouts, quotas, resumption and tenant/device isolation.
begin;
insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-0000000000a1', 'activity-a@example.test'),
 ('00000000-0000-0000-0000-0000000000a2', 'activity-b@example.test');
insert into public.projects(id, org_id, name) values
 ('10000000-0000-0000-0000-0000000000a1', (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000a1'), 'A'),
 ('10000000-0000-0000-0000-0000000000a2', (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000a2'), 'B');
insert into public.studies(id, project_id, tool_type, name, status, access_token, max_responses) values
 ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'iat', 'A', 'published', 'activity-a', 1),
 ('20000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-0000000000a1', 'survey', 'Encuesta', 'published', 'activity-s', null),
 ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a2', 'iat', 'B', 'published', 'activity-b', null);
insert into public.batteries(id, project_id, name, status, access_token, max_responses) values
 ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Batería A', 'published', 'activity-battery', 1);
insert into public.battery_steps(battery_id, position, study_id) values
 ('40000000-0000-0000-0000-0000000000a1', 0, '20000000-0000-0000-0000-0000000000a1'),
 ('40000000-0000-0000-0000-0000000000a1', 1, '20000000-0000-0000-0000-0000000000a3');
insert into public.sessions(id, study_id, participant_ref, device_id, started_at, last_activity_at) values
 ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'active-long-study', '60000000-0000-0000-0000-0000000000a1', now() - interval '3 hours', now()),
 ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2', 'foreign-old', '60000000-0000-0000-0000-0000000000a2', now() - interval '3 hours', now() - interval '31 minutes');

do $$ declare r record; begin
 -- Wrong device and link cannot touch the participation.
 assert public.touch_participation_activity('study', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a2', false) = 'not_found';
 assert public.touch_participation_activity('study', '20000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', false) = 'not_found';
 assert public.touch_participation_activity('study', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', true) = 'ok';
 assert (select status = 'started' and inactive_since is not null from public.sessions where id = '30000000-0000-0000-0000-0000000000a1'), 'closing only signals inactivity';
 update public.sessions set inactive_since = now() - interval '5 minutes' where id = '30000000-0000-0000-0000-0000000000a1';
 assert public.touch_participation_activity('study', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', true) = 'ok';
 assert (select inactive_since = now() - interval '5 minutes' from public.sessions where id = '30000000-0000-0000-0000-0000000000a1'), 'duplicate exit signals never extend the deadline';
 assert public.touch_participation_activity('study', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', false) = 'ok';
 assert (select inactive_since is null from public.sessions where id = '30000000-0000-0000-0000-0000000000a1'), 'reconnect clears inactivity';
 select * into r from public.claim_session('20000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a3', null, null, '{}', null, 'test', '[]', 'keyboard', 'desktop', 1280, 800);
 assert r.outcome = 'full', 'an active session older than 2 hours still reserves quota';
 update public.sessions set last_activity_at = now() - interval '30 minutes' where id = '30000000-0000-0000-0000-0000000000a1';
 assert public.touch_participation_activity('study', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', false) = 'expired';
 assert (select status = 'abandoned' and abandon_reason = 'inactivity' and abandoned_at is not null from public.sessions where id = '30000000-0000-0000-0000-0000000000a1');
 -- An expired single-study attempt cannot be revived by a late heartbeat.
 assert public.touch_participation_activity('study', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', false) = 'expired';
 select * into r from public.claim_session('20000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a3', null, null, '{}', null, 'test', '[]', 'keyboard', 'desktop', 1280, 800);
 assert r.outcome = 'ok', 'abandonment frees quota';
 update public.sessions set status = 'completed' where id = r.new_session_id;
 assert public.touch_participation_activity('study', '20000000-0000-0000-0000-0000000000a1', r.new_session_id, '60000000-0000-0000-0000-0000000000a3', true) = 'completed';
 assert (select status = 'completed' and inactive_since is null from public.sessions where id = r.new_session_id), 'late close cannot change completed state';
 insert into public.sessions(id, study_id, participant_ref, device_id, last_activity_at) values
   ('30000000-0000-0000-0000-0000000000a6', '20000000-0000-0000-0000-0000000000a3', 'expired-before-retry', '60000000-0000-0000-0000-0000000000a4', now() - interval '31 minutes');
 select * into r from public.claim_session('20000000-0000-0000-0000-0000000000a3', '60000000-0000-0000-0000-0000000000a4', null, null, '{}', null, 'test', '[]', 'keyboard', 'desktop', 1280, 800);
 assert r.outcome = 'ok';
 assert (select abandon_reason = 'inactivity' from public.sessions where id = '30000000-0000-0000-0000-0000000000a6'), 'retry classifies an expired previous attempt correctly even without a dashboard sweep';
end $$;

insert into public.battery_sessions(id, battery_id, participant_ref, run_order, device_id, last_activity_at) values
 ('50000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1', 'battery-participant', '["20000000-0000-0000-0000-0000000000a1","20000000-0000-0000-0000-0000000000a3"]', '60000000-0000-0000-0000-0000000000a1', now() - interval '31 minutes');
insert into public.sessions(id, study_id, participant_ref, status, battery_session_id, last_activity_at) values
 ('30000000-0000-0000-0000-0000000000a4', '20000000-0000-0000-0000-0000000000a1', 'completed-child', 'completed', '50000000-0000-0000-0000-0000000000a1', now() - interval '31 minutes'),
 ('30000000-0000-0000-0000-0000000000a5', '20000000-0000-0000-0000-0000000000a3', 'started-child', 'started', '50000000-0000-0000-0000-0000000000a1', now() - interval '31 minutes');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.refresh_participation_activity('battery', '40000000-0000-0000-0000-0000000000a1');
do $$ begin
 assert (select status = 'abandoned' and abandon_reason = 'inactivity' from public.battery_sessions where id = '50000000-0000-0000-0000-0000000000a1');
 assert (select status = 'abandoned' from public.sessions where id = '30000000-0000-0000-0000-0000000000a5');
 assert (select status = 'completed' from public.sessions where id = '30000000-0000-0000-0000-0000000000a4');
 begin
  perform public.refresh_participation_activity('study', '20000000-0000-0000-0000-0000000000a2');
  raise exception 'foreign sweep allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.sessions set last_activity_at = now();
  raise exception 'researcher modified presence directly';
 exception when insufficient_privilege then null; end;
 assert not has_function_privilege('authenticated', 'public.touch_participation_activity(text, uuid, uuid, uuid, boolean)', 'execute');
 assert not has_function_privilege('anon', 'public.refresh_participation_activity(text, uuid)', 'execute');
end $$;
reset role;
do $$ declare r record; begin
 assert (select status = 'started' from public.sessions where id = '30000000-0000-0000-0000-0000000000a2'), 'foreign sessions unchanged';
 select * into r from public.claim_battery_session('40000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', null, null, 'test', 'desktop');
 assert r.outcome = 'resumed' and r.new_session_id = '50000000-0000-0000-0000-0000000000a1';
 assert (select status = 'started' and abandon_reason is null and inactive_since is null from public.battery_sessions where id = r.new_session_id);
 assert (select status = 'completed' from public.sessions where id = '30000000-0000-0000-0000-0000000000a4'), 'resumption preserves completed children';
 -- Parent heartbeats keep an in-progress child alive too (exposure/embedded runners).
 update public.sessions set status = 'started' where id = '30000000-0000-0000-0000-0000000000a5';
 assert public.touch_participation_activity('battery', '40000000-0000-0000-0000-0000000000a1', r.new_session_id, '60000000-0000-0000-0000-0000000000a1', false) = 'ok';
 assert (select last_activity_at = now() from public.sessions where id = '30000000-0000-0000-0000-0000000000a5');
 update public.battery_sessions set status = 'abandoned', abandon_reason = 'inactivity' where id = r.new_session_id;
 select * into r from public.claim_battery_session('40000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a3', null, null, 'test', 'desktop');
 assert r.outcome = 'ok';
 select * into r from public.claim_battery_session('40000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000000a1', null, null, 'test', 'desktop');
 assert r.outcome = 'full', 'resumption cannot overbook a full battery';
end $$;
rollback;
select 'PARTICIPATION_ACTIVITY_OK' as result;
