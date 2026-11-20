-- Fase 2 (Servicios Web): módulo Eyetracking para Web (`web_eyetracking`)
-- Soporta modo sitio en vivo (snippet en <head>) y modo sin código (capturas web con scroll).

alter table public.studies drop constraint studies_tool_type_check;
alter table public.studies add constraint studies_tool_type_check
  check (tool_type in ('iat', 'seo', 'visual', 'survey', 'iat_variant', 'web_visual', 'web_eyetracking'));

alter table public.studies drop constraint studies_participant_tools_require_token;
alter table public.studies add constraint studies_participant_tools_require_token
  check (tool_type not in ('iat', 'survey', 'iat_variant', 'web_eyetracking') or access_token is not null);

create table public.web_eyetracking_runs (
  session_id    uuid primary key,
  study_id      uuid not null references public.studies (id) on delete cascade,
  mode          text not null check (mode in ('live_snippet', 'no_code_captures')),
  validation    jsonb not null default '{}'::jsonb check (jsonb_typeof(validation) = 'object'),
  step_events   jsonb not null default '[]'::jsonb check (jsonb_typeof(step_events) = 'array'),
  samples       jsonb not null default '[]'::jsonb check (jsonb_typeof(samples) = 'array'),
  summary       jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  created_at    timestamptz not null default now(),
  constraint web_eyetracking_runs_session_study_fk
    foreign key (session_id, study_id) references public.sessions (id, study_id) on delete cascade
);
create index web_eyetracking_runs_study_idx on public.web_eyetracking_runs (study_id, created_at desc);

alter table public.web_eyetracking_runs enable row level security;
create policy web_eyetracking_runs_select on public.web_eyetracking_runs for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));

revoke all on public.web_eyetracking_runs from anon, authenticated;
grant select on public.web_eyetracking_runs to authenticated;
grant all on public.web_eyetracking_runs to service_role;
