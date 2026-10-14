-- NeuroFusion · herramientas 2 y 3: Auditoría SEO y Análisis visual (pieza + journey/IFD).
--
-- Origen: el módulo NeuroSEO v1.0 (Python/CLI) se dividió en dos herramientas y se portó a
-- TypeScript. Aquí sólo vive la persistencia; los cálculos son código puro en src/tools/*.
-- Mismo modelo de seguridad que el IAT: el investigador accede por RLS a lo de su organización.

-- ============================================================ estudios: nuevas herramientas

alter table public.studies drop constraint studies_tool_type_check;
alter table public.studies add constraint studies_tool_type_check
  check (tool_type in ('iat', 'seo', 'visual'));

-- La liga mágica sólo existe para herramientas con participantes (IAT).
alter table public.studies alter column access_token drop not null;
alter table public.studies add constraint studies_iat_requires_token
  check (tool_type <> 'iat' or access_token is not null);

-- ============================================================ SEO

create table public.seo_audits (
  id               uuid primary key default gen_random_uuid(),
  study_id         uuid not null references public.studies (id) on delete cascade,
  -- live: rastreo desde el servidor · upload: HTML subido por el analista (modo asistido)
  mode             text not null check (mode in ('live', 'upload')),
  site_url         text not null,
  engine_version   text not null,
  -- Conteos por severidad + puntuación (recalculados siempre desde `findings`).
  summary          jsonb not null,
  pages            jsonb not null default '[]'::jsonb,
  findings         jsonb not null default '[]'::jsonb,
  performance      jsonb,
  notes            jsonb not null default '[]'::jsonb,
  duration_ms      integer,
  -- Recomendaciones redactadas por IA sobre los hallazgos (nunca sobre HTML crudo).
  ai_result        jsonb,
  ai_provider      text,
  ai_model         text,
  ai_generated_at  timestamptz,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now()
);
create index seo_audits_study_idx on public.seo_audits (study_id, created_at desc);

-- ============================================================ Visual

create table public.visual_assets (
  id                 uuid primary key default gen_random_uuid(),
  study_id           uuid not null references public.studies (id) on delete cascade,
  -- Ruta en el bucket study-assets: "{study_id}/{uuid}.{ext}"
  storage_path       text not null unique,
  file_name          text not null,
  mime_type          text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  width              integer not null check (width > 0),
  height             integer not null check (height > 0),
  bytes              integer not null check (bytes > 0),
  sha256             text not null,
  title              text not null check (char_length(title) between 1 and 160),
  -- Modo pieza: formato/colocación declarada (meta_feed, display_300x250, ...).
  placement          text,
  -- Modo journey: sitio y tarea a los que pertenece la captura.
  site_key           text,
  task_id            text,
  position           integer not null default 0,
  -- Métricas deterministas calculadas en el servidor a partir de los píxeles.
  metrics            jsonb,
  metrics_version    text,
  -- Lectura de la IA (visión). Es una estimación, no eye tracking.
  ai_result          jsonb,
  ai_provider        text,
  ai_model           text,
  ai_engine_version  text,
  ai_generated_at    timestamptz,
  -- Áreas de interés vigentes (propuestas por IA y/o corregidas por el analista).
  aois               jsonb not null default '[]'::jsonb,
  aois_source        text not null default 'none' check (aois_source in ('none', 'ai', 'analyst')),
  aois_reviewed_at   timestamptz,
  aois_reviewed_by   uuid references auth.users (id) on delete set null,
  created_by         uuid references auth.users (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index visual_assets_study_idx on public.visual_assets (study_id, site_key, task_id, position);

create trigger visual_assets_touch before update on public.visual_assets
  for each row execute function public.touch_updated_at();

-- Calificación de fricciones con evidencia (regla de oro de la rúbrica: toda calificación cita evidencia).
create table public.friction_ratings (
  id                 uuid primary key default gen_random_uuid(),
  study_id           uuid not null references public.studies (id) on delete cascade,
  site_key           text not null,
  item_key           text not null,
  value              real not null check (value >= 0 and value <= 1),
  justification      text not null check (char_length(justification) between 10 and 2000),
  evidence_asset_id  uuid references public.visual_assets (id) on delete set null,
  -- analyst: calificó el analista · ai_assisted: partió de una sugerencia de IA y el analista la confirmó
  source             text not null default 'analyst' check (source in ('analyst', 'ai_assisted')),
  rubric_version     text not null,
  rated_by           uuid references auth.users (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (study_id, site_key, item_key)
);
create index friction_ratings_study_idx on public.friction_ratings (study_id, site_key);

create trigger friction_ratings_touch before update on public.friction_ratings
  for each row execute function public.touch_updated_at();

-- Sugerencias de calificación generadas por IA a partir de las capturas (el analista decide).
create table public.friction_suggestions (
  id           uuid primary key default gen_random_uuid(),
  study_id     uuid not null references public.studies (id) on delete cascade,
  site_key     text not null,
  result       jsonb not null,
  provider     text not null,
  model        text not null,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index friction_suggestions_study_idx on public.friction_suggestions (study_id, site_key, created_at desc);

-- Mediciones del IFD. Cada corrida congela entradas y versiones: nunca se recalcula
-- una medición vieja con una fórmula nueva (se vuelve a medir).
create table public.ifd_measurements (
  id                   uuid primary key default gen_random_uuid(),
  study_id             uuid not null references public.studies (id) on delete cascade,
  run_id               uuid not null,
  site_key             text not null,
  site_name            text not null,
  site_url             text not null,
  is_competitor        boolean not null default false,
  engine_version       text not null,
  ifd_version          text not null,
  calibration_version  text not null,
  rubric_version       text not null,
  seed                 bigint not null,
  n_panel              integer not null,
  inputs               jsonb not null,
  summary              jsonb not null,
  score                real not null,
  ifd                  real not null,
  reading              text not null,
  created_by           uuid references auth.users (id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now()
);
create index ifd_measurements_study_idx on public.ifd_measurements (study_id, created_at desc);
create index ifd_measurements_url_idx on public.ifd_measurements (site_url, created_at);

-- ============================================================ RLS

alter table public.seo_audits           enable row level security;
alter table public.visual_assets        enable row level security;
alter table public.friction_ratings     enable row level security;
alter table public.friction_suggestions enable row level security;
alter table public.ifd_measurements     enable row level security;

create policy seo_audits_select on public.seo_audits for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));
create policy seo_audits_insert on public.seo_audits for insert to authenticated
  with check (public.is_org_member(public.study_org(study_id)));
create policy seo_audits_update on public.seo_audits for update to authenticated
  using (public.is_org_member(public.study_org(study_id)))
  with check (public.is_org_member(public.study_org(study_id)));
create policy seo_audits_delete on public.seo_audits for delete to authenticated
  using (public.is_org_member(public.study_org(study_id)));

create policy visual_assets_select on public.visual_assets for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));
create policy visual_assets_insert on public.visual_assets for insert to authenticated
  with check (public.is_org_member(public.study_org(study_id)));
create policy visual_assets_update on public.visual_assets for update to authenticated
  using (public.is_org_member(public.study_org(study_id)))
  with check (public.is_org_member(public.study_org(study_id)));
create policy visual_assets_delete on public.visual_assets for delete to authenticated
  using (public.is_org_member(public.study_org(study_id)));

create policy friction_ratings_select on public.friction_ratings for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));
create policy friction_ratings_insert on public.friction_ratings for insert to authenticated
  with check (public.is_org_member(public.study_org(study_id)));
create policy friction_ratings_update on public.friction_ratings for update to authenticated
  using (public.is_org_member(public.study_org(study_id)))
  with check (public.is_org_member(public.study_org(study_id)));
create policy friction_ratings_delete on public.friction_ratings for delete to authenticated
  using (public.is_org_member(public.study_org(study_id)));

create policy friction_suggestions_select on public.friction_suggestions for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));
create policy friction_suggestions_insert on public.friction_suggestions for insert to authenticated
  with check (public.is_org_member(public.study_org(study_id)));
create policy friction_suggestions_delete on public.friction_suggestions for delete to authenticated
  using (public.is_org_member(public.study_org(study_id)));

-- Las mediciones son inmutables: se insertan y se pueden borrar, nunca se editan.
create policy ifd_measurements_select on public.ifd_measurements for select to authenticated
  using (public.is_org_member(public.study_org(study_id)));
create policy ifd_measurements_insert on public.ifd_measurements for insert to authenticated
  with check (public.is_org_member(public.study_org(study_id)));
create policy ifd_measurements_delete on public.ifd_measurements for delete to authenticated
  using (public.is_org_member(public.study_org(study_id)));

revoke all on public.seo_audits, public.visual_assets, public.friction_ratings,
  public.friction_suggestions, public.ifd_measurements from anon;
revoke update on public.ifd_measurements, public.friction_suggestions from authenticated;

-- Los análisis de IA y las métricas los escribe el servidor con la sesión del analista;
-- el analista no puede reescribir la identidad del archivo ni la autoría.
revoke update on public.visual_assets from authenticated;
grant update (title, placement, site_key, task_id, position, metrics, metrics_version,
              ai_result, ai_provider, ai_model, ai_engine_version, ai_generated_at,
              aois, aois_source, aois_reviewed_at, aois_reviewed_by)
  on public.visual_assets to authenticated;
revoke update on public.seo_audits from authenticated;
grant update (ai_result, ai_provider, ai_model, ai_generated_at) on public.seo_audits to authenticated;

-- ============================================================ Storage

-- Org dueña de un objeto del bucket a partir de su ruta "{study_id}/...". NULL si la ruta no
-- empieza con un UUID (así un nombre malformado no rompe la política con un error de cast).
create function public.storage_object_org(object_name text)
returns uuid
language plpgsql stable security definer
set search_path = public
as $$
declare
  first_segment text := split_part(object_name, '/', 1);
begin
  if first_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return public.study_org(first_segment::uuid);
end;
$$;
revoke execute on function public.storage_object_org(text) from public, anon;
grant execute on function public.storage_object_org(text) to authenticated, service_role;

-- Bucket privado: imágenes de piezas y capturas. Máx. 10 MB por archivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-assets', 'study-assets', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy study_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'study-assets' and public.is_org_member(public.storage_object_org(name)));
create policy study_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'study-assets' and public.is_org_member(public.storage_object_org(name)));
create policy study_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'study-assets' and public.is_org_member(public.storage_object_org(name)));
