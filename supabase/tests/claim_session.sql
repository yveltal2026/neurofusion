-- Pruebas de claim_session (límite de respuestas, candado por dispositivo, marca por IP).
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'c@example.com');
insert into public.projects (id, org_id, name)
  select '10000000-0000-0000-0000-0000000000c1', org_id, 'P'
  from public.memberships where user_id = '00000000-0000-0000-0000-0000000000c1';

insert into public.studies (id, project_id, tool_type, name, status, access_token, duplicate_policy) values
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'iat', 'cookie',  'published', 't1', 'device_cookie'),
  ('20000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', 'iat', 'cookie+ip','published', 't2', 'device_cookie_and_ip'),
  ('20000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-0000000000c1', 'iat', 'none',    'published', 't3', 'none'),
  ('20000000-0000-0000-0000-0000000000c4', '10000000-0000-0000-0000-0000000000c1', 'iat', 'draft',   'draft',     't4', 'device_cookie'),
  ('20000000-0000-0000-0000-0000000000c5', '10000000-0000-0000-0000-0000000000c1', 'iat', 'closed',  'published', 't5', 'device_cookie');
update public.studies set closes_at = now() - interval '1 minute' where id = '20000000-0000-0000-0000-0000000000c5';
update public.studies set max_responses = 2 where id = '20000000-0000-0000-0000-0000000000c3';

create function pg_temp.claim(study uuid, device uuid, ip text, ua text default 'UA')
returns table (outcome text, new_session_id uuid) language sql as $$
  select * from public.claim_session(study, device, ip, ua, '{}'::jsonb, 'A', 'v1', '[]'::jsonb, 'keyboard', 'desktop', 1280, 800)
$$;
grant execute on function pg_temp.claim(uuid, uuid, text, text) to service_role;

set local role service_role;
do $$
declare
  r record; first_id uuid; d1 uuid := '99999999-0000-0000-0000-000000000001'; d2 uuid := '99999999-0000-0000-0000-000000000002';
begin
  -- Estados no válidos
  assert (select outcome from pg_temp.claim('20000000-0000-0000-0000-0000000000ff', d1, 'ip')) = 'not_found';
  assert (select outcome from pg_temp.claim('20000000-0000-0000-0000-0000000000c4', d1, 'ip')) = 'not_published';
  assert (select outcome from pg_temp.claim('20000000-0000-0000-0000-0000000000c5', d1, 'ip')) = 'closed';

  -- Candado por dispositivo
  select * into r from pg_temp.claim('20000000-0000-0000-0000-0000000000c1', d1, 'ip-a');
  assert r.outcome = 'ok' and r.new_session_id is not null;
  first_id := r.new_session_id;
  -- Reintento sin completar: se abandona el anterior y se crea uno nuevo.
  select * into r from pg_temp.claim('20000000-0000-0000-0000-0000000000c1', d1, 'ip-a');
  assert r.outcome = 'ok' and r.new_session_id <> first_id;
  assert (select status from public.sessions where id = first_id) = 'abandoned', 'intento previo debe quedar abandonado';
  -- Al completar, el dispositivo queda bloqueado...
  update public.sessions set status = 'completed', completed_at = now() where id = r.new_session_id;
  assert (select outcome from pg_temp.claim('20000000-0000-0000-0000-0000000000c1', d1, 'ip-a')) = 'already_participated';
  -- ...pero otro dispositivo (misma IP) puede participar con política device_cookie, sin marca.
  select * into r from pg_temp.claim('20000000-0000-0000-0000-0000000000c1', d2, 'ip-a');
  assert r.outcome = 'ok';
  assert (select duplicate_flag from public.sessions where id = r.new_session_id) = false, 'device_cookie no marca por IP';

  -- device_cookie_and_ip: misma IP + mismo UA se marca, no se bloquea; distinto UA no se marca.
  select * into r from pg_temp.claim('20000000-0000-0000-0000-0000000000c2', d1, 'ip-z', 'UA1');
  assert r.outcome = 'ok' and (select duplicate_flag from public.sessions where id = r.new_session_id) = false;
  select * into r from pg_temp.claim('20000000-0000-0000-0000-0000000000c2', d2, 'ip-z', 'UA1');
  assert r.outcome = 'ok' and (select duplicate_flag from public.sessions where id = r.new_session_id) = true, 'misma IP+UA se marca';
  select * into r from pg_temp.claim('20000000-0000-0000-0000-0000000000c2', gen_random_uuid(), 'ip-z', 'UA2');
  assert r.outcome = 'ok' and (select duplicate_flag from public.sessions where id = r.new_session_id) = false, 'distinto UA no se marca';

  -- Política none: se puede repetir con el mismo dispositivo; límite de 2 respuestas.
  select * into r from pg_temp.claim('20000000-0000-0000-0000-0000000000c3', d1, 'ip');
  assert r.outcome = 'ok';
  update public.sessions set status = 'completed', completed_at = now() where id = r.new_session_id;
  select * into r from pg_temp.claim('20000000-0000-0000-0000-0000000000c3', d1, 'ip');
  assert r.outcome = 'ok', 'none permite repetir';
  assert (select outcome from pg_temp.claim('20000000-0000-0000-0000-0000000000c3', d2, 'ip')) = 'full', 'límite alcanzado (1 completada + 1 en curso)';
end $$;

-- Ni anon ni authenticated pueden ejecutarla.
reset role;
set local role authenticated;
do $$
begin
  begin
    perform public.claim_session('20000000-0000-0000-0000-0000000000c1', null, null, null, '{}', 'A', null, '[]', null, 'desktop', null, null);
    raise exception 'authenticated no debería poder ejecutar claim_session';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform public.claim_session('20000000-0000-0000-0000-0000000000c1', null, null, null, '{}', 'A', null, '[]', null, 'desktop', null, null);
    raise exception 'anon no debería poder ejecutar claim_session';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
select 'CLAIM_OK' as result;
