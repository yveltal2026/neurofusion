-- NeuroFusion · herramienta 4: Encuesta (instrumentos estandarizados + preguntas propias).
--
-- Una encuesta es un estudio con participantes: usa la misma liga mágica, el mismo
-- `claim_session` (candado anti-repetición y límite de respuestas atómicos) y la misma
-- tabla `sessions` que el IAT. Aquí sólo se amplía el tipo de herramienta y se añade
-- dónde viven las respuestas. Los cálculos son código puro en src/tools/survey/engine.

-- ============================================================ estudios: nueva herramienta

alter table public.studies drop constraint studies_tool_type_check;
alter table public.studies add constraint studies_tool_type_check
  check (tool_type in ('iat', 'seo', 'visual', 'survey'));

-- La liga mágica existe para las herramientas con participantes (IAT y encuesta).
alter table public.studies drop constraint studies_iat_requires_token;
alter table public.studies add constraint studies_participant_tools_require_token
  check (tool_type not in ('iat', 'survey') or access_token is not null);

-- ============================================================ respuestas

-- Permite que una fila hija garantice, con una llave compuesta, que pertenece al mismo
-- estudio que su sesión (no basta con confiar en que la app copie bien el study_id).
alter table public.sessions add constraint sessions_id_study_key unique (id, study_id);

create table public.survey_answers (
  session_id     uuid primary key,
  study_id       uuid not null,
  -- Respuestas del participante, ya validadas por el servidor contra la configuración.
  answers        jsonb not null,
  -- Puntuaciones de instrumentos calculadas por el servidor (SUS, NPS, ...). Nunca del cliente.
  scores         jsonb not null default '[]'::jsonb,
  -- Versión del motor con que se puntuó (una medición vieja no se recalcula con fórmula nueva).
  engine_version text not null,
  created_at     timestamptz not null default now(),
  foreign key (session_id, study_id)
    references public.sessions (id, study_id) on delete cascade,
  foreign key (study_id) references public.studies (id) on delete cascade
);
create index survey_answers_study_idx on public.survey_answers (study_id, created_at desc);

alter table public.survey_answers enable row level security;

-- El investigador sólo lee; el servidor escribe con la service role (que ignora RLS).
-- Borrar una sesión borra sus respuestas por la llave foránea en cascada.
create policy survey_answers_select on public.survey_answers for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));

revoke all on public.survey_answers from anon;
revoke insert, update, delete on public.survey_answers from authenticated;
