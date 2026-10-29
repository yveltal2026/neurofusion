-- Context snapshots must remain isolated by study/battery ownership.
begin;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000f1', 'analysis-a@example.test'),
 ('00000000-0000-0000-0000-0000000000f2', 'analysis-b@example.test');
insert into public.projects (id, org_id, name) values
 ('10000000-0000-0000-0000-0000000000f1', (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1'), 'A'),
 ('10000000-0000-0000-0000-0000000000f2', (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f2'), 'B');
insert into public.studies (id, project_id, tool_type, name, access_token) values
 ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'survey', 'A', 'analysis-a'),
 ('20000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f2', 'survey', 'B', 'analysis-b');
insert into public.batteries (id, project_id, name, access_token) values
 ('40000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'A', 'analysis-battery-a'),
 ('40000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f2', 'B', 'analysis-battery-b');
insert into public.research_analyses(study_id, context, aggregates, result, n_sessions, provider, model) values
 ('20000000-0000-0000-0000-0000000000f2', '{}', '{}', '{}', 3, 'test', 'test');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$ begin
 assert (select count(*) from public.research_analyses) = 0, 'foreign study history hidden';
 insert into public.research_analyses(study_id, context, aggregates, result, n_sessions, provider, model) values
  ('20000000-0000-0000-0000-0000000000f1', '{}', '{}', '{}', 3, 'test', 'test');
 insert into public.research_analyses(battery_id, context, aggregates, result, n_sessions, provider, model) values
  ('40000000-0000-0000-0000-0000000000f1', '{}', '{}', '{}', 3, 'test', 'test');
 assert (select count(*) from public.research_analyses) = 2, 'own study and battery history visible';
 begin
  insert into public.research_analyses(study_id, context, aggregates, result, n_sessions, provider, model) values
   ('20000000-0000-0000-0000-0000000000f2', '{}', '{}', '{}', 3, 'test', 'test');
  raise exception 'foreign study insert allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.research_analyses(battery_id, context, aggregates, result, n_sessions, provider, model) values
   ('40000000-0000-0000-0000-0000000000f2', '{}', '{}', '{}', 3, 'test', 'test');
  raise exception 'foreign battery insert allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.research_analyses set context = '{}';
  raise exception 'history must be immutable';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform count(*) from public.research_analyses;
  raise exception 'anonymous read allowed';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'RESEARCH_ANALYSES_OK' as result;
