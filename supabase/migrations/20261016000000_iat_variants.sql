-- NeuroFusion · herramienta 5: variantes del IAT (SC-IAT, Go/No-Go y priming evaluativo).
--
-- Una variante es un estudio con participantes, igual que el IAT clásico y la encuesta: usa la
-- misma liga mágica, `claim_session` (candado anti-repetición y límite de respuestas atómicos) y
-- la tabla `sessions`. El IAT clásico guarda un ensayo por fila porque siempre tiene la misma
-- forma (7 bloques, 4 categorías); las variantes tienen formas distintas, así que se guarda una
-- fila por sesión con los ensayos y las puntuaciones que calculó el servidor. Los cálculos son
-- código puro en src/tools/variants y src/tools/iat/engine/variants.ts.

-- ============================================================ estudios: nueva herramienta

alter table public.studies drop constraint studies_tool_type_check;
alter table public.studies add constraint studies_tool_type_check
  check (tool_type in ('iat', 'seo', 'visual', 'survey', 'iat_variant'));

alter table public.studies drop constraint studies_participant_tools_require_token;
alter table public.studies add constraint studies_participant_tools_require_token
  check (tool_type not in ('iat', 'survey', 'iat_variant') or access_token is not null);

-- ============================================================ resultados

create table public.variant_results (
  session_id     uuid primary key,
  study_id       uuid not null,
  variant        text not null check (variant in ('sc_iat', 'gnat', 'priming')),
  -- Respuestas ya validadas contra el plan regenerado por el servidor:
  -- [{ "seq": 0, "block": "sc_practice_...", "practice": true, "key": "left", "rtMs": 612, "correct": true }, ...]
  trials         jsonb not null,
  -- Puntuación completa calculada por el servidor (src/tools/variants/score.ts). Nunca del cliente.
  scores         jsonb not null,
  -- Medida principal (D, contraste de d' o efecto en ms); null si no se pudo calcular.
  primary_value  double precision,
  -- false ⇒ el análisis la excluye del promedio y la lista como advertencia de calidad.
  valid          boolean not null,
  flags          text[] not null default '{}',
  engine_version text not null,
  created_at     timestamptz not null default now(),
  foreign key (session_id, study_id)
    references public.sessions (id, study_id) on delete cascade,
  foreign key (study_id) references public.studies (id) on delete cascade
);
create index variant_results_study_idx on public.variant_results (study_id, created_at desc);

alter table public.variant_results enable row level security;

-- El investigador sólo lee; el servidor escribe con la service role (que ignora RLS).
-- Borrar una sesión borra sus resultados por la llave foránea en cascada.
create policy variant_results_select on public.variant_results for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));

revoke all on public.variant_results from anon;
revoke insert, update, delete on public.variant_results from authenticated;
