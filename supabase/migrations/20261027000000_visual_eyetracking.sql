-- Sesiones de medición real de piezas visuales. El video nunca se almacena:
-- sólo coordenadas normalizadas, tiempo y calidad de calibración.

alter table public.sessions add constraint sessions_id_study_unique unique (id, study_id);

create table public.eye_tracking_runs (
  session_id    uuid primary key,
  study_id      uuid not null references public.studies (id) on delete cascade,
  validation    jsonb not null check (jsonb_typeof(validation) = 'object'),
  observations  jsonb not null check (jsonb_typeof(observations) = 'array' and jsonb_array_length(observations) between 1 and 5),
  created_at    timestamptz not null default now(),
  constraint eye_tracking_runs_session_study_fk
    foreign key (session_id, study_id) references public.sessions (id, study_id) on delete cascade
);
create index eye_tracking_runs_study_idx on public.eye_tracking_runs (study_id, created_at desc);

alter table public.eye_tracking_runs enable row level security;
create policy eye_tracking_runs_select on public.eye_tracking_runs for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));

revoke all on public.eye_tracking_runs from anon, authenticated;
grant select on public.eye_tracking_runs to authenticated;
grant all on public.eye_tracking_runs to service_role;
