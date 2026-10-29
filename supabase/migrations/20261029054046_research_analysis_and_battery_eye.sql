-- Webcam steps use their calibrated runner and link_battery_step; the exposure RPC still rejects webcam.
create or replace function public.battery_steps_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  s_tool    text;
  s_project uuid;
  s_mode    text;
  b_project uuid;
begin
  select tool_type, project_id, config ->> 'mode' into s_tool, s_project, s_mode
  from public.studies where id = new.study_id;
  select project_id into b_project from public.batteries where id = new.battery_id;
  if s_tool is null or b_project is null then
    raise exception 'El estudio o la batería no existe' using errcode = '23514';
  end if;
  if s_tool not in ('iat', 'survey', 'iat_variant', 'visual') then
    raise exception 'Sólo los estudios IAT, variantes del IAT, encuesta e imagen con IA pueden ser pasos de una batería' using errcode = '23514';
  end if;
  if s_tool = 'visual' and s_mode is distinct from 'pieces' then
    raise exception 'Sólo el análisis de piezas (imagen con IA) puede ser un paso; el journey es un panel modelado' using errcode = '23514';
  end if;
  if s_project <> b_project then
    raise exception 'El estudio debe pertenecer al mismo proyecto que la batería' using errcode = '23514';
  end if;
  return new;
end;
$$;


-- A calibrated webcam session cannot be completed through the exposure endpoint.
create or replace function public.complete_battery_exposure(p_battery_session uuid, p_session uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  s public.sessions%rowtype;
  bs public.battery_sessions%rowtype;
  st public.studies%rowtype;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found or s.battery_session_id is distinct from p_battery_session then return 'not_found'; end if;
  select * into st from public.studies where id = s.study_id;
  if st.tool_type is distinct from 'visual' or st.config ->> 'mode' is distinct from 'pieces'
    or (st.config -> 'eyeTracking' is not null and st.config -> 'eyeTracking' <> 'null'::jsonb) then
    return 'not_exposure';
  end if;
  if s.status = 'completed' then return 'ok'; end if;
  select * into bs from public.battery_sessions where id = p_battery_session;
  if not found then return 'not_found'; end if;
  if bs.status <> 'started' or s.status <> 'started' then return 'battery_session_closed'; end if;
  update public.sessions set status = 'completed', completed_at = now() where id = s.id;
  return 'ok';
end;
$$;
revoke all on function public.complete_battery_exposure(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_battery_exposure(uuid, uuid) to service_role;

-- Context and aggregate snapshots for surveys, measured gaze and integrated batteries.
create table public.research_analyses (
  id uuid primary key default gen_random_uuid(),
  study_id uuid references public.studies(id) on delete cascade,
  battery_id uuid references public.batteries(id) on delete cascade,
  context jsonb not null,
  aggregates jsonb not null,
  result jsonb not null,
  n_sessions integer not null check (n_sessions >= 3),
  provider text not null,
  model text not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(study_id, battery_id) = 1)
);
create index research_analyses_study_idx on public.research_analyses(study_id, created_at desc);
create index research_analyses_battery_idx on public.research_analyses(battery_id, created_at desc);
alter table public.research_analyses enable row level security;
create policy research_analyses_select on public.research_analyses for select to authenticated
using (
  (study_id is not null and public.is_org_member(public.study_org(study_id)))
  or exists (select 1 from public.batteries b where b.id = battery_id and public.is_org_member(public.project_org(b.project_id)))
);
create policy research_analyses_insert on public.research_analyses for insert to authenticated
with check (
  created_by = (select auth.uid()) and (
    (study_id is not null and public.is_org_member(public.study_org(study_id)))
    or exists (select 1 from public.batteries b where b.id = battery_id and public.is_org_member(public.project_org(b.project_id)))
  )
);
revoke all on public.research_analyses from public, anon, authenticated;
grant select, insert on public.research_analyses to authenticated;
grant all on public.research_analyses to service_role;
