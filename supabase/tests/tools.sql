-- Pruebas de las herramientas SEO y Visual: restricciones, RLS y políticas del bucket.
-- Correr tras 00_stub.sql + migraciones (lo hace scripts/verify-sql.sh).

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'carla@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'dario@example.com');

insert into public.projects (id, org_id, name) values
  ('10000000-0000-0000-0000-0000000000c1',
   (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000c1'), 'Proyecto de Carla'),
  ('10000000-0000-0000-0000-0000000000d1',
   (select org_id from public.memberships where user_id = '00000000-0000-0000-0000-0000000000d1'), 'Proyecto de Darío');

-- Restricciones de estudios: SEO/visual sin liga; IAT la exige; tool_type acotado.
insert into public.studies (id, project_id, tool_type, name) values
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'visual', 'Visual de Carla'),
  ('20000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', 'seo', 'SEO de Carla'),
  ('20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'visual', 'Visual de Darío');

do $$
begin
  begin
    insert into public.studies (project_id, tool_type, name)
      values ('10000000-0000-0000-0000-0000000000c1', 'iat', 'IAT sin liga');
    raise exception 'un IAT sin access_token debería rechazarse';
  exception when check_violation then null;
  end;
  begin
    insert into public.studies (project_id, tool_type, name)
      values ('10000000-0000-0000-0000-0000000000c1', 'eyetracking', 'x');
    raise exception 'tool_type desconocido debería rechazarse';
  exception when check_violation then null;
  end;
end $$;

insert into storage.objects (bucket_id, name) values
  ('study-assets', '20000000-0000-0000-0000-0000000000c1/a.png'),
  ('study-assets', '20000000-0000-0000-0000-0000000000d1/b.png');
insert into public.visual_assets (id, study_id, storage_path, file_name, mime_type, width, height, bytes, sha256, title) values
  ('40000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d1',
   '20000000-0000-0000-0000-0000000000d1/b.png', 'b.png', 'image/png', 10, 10, 100, 'x', 'Pieza de Darío');

-- ---------------------------------------------------------------- Carla
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

do $$
declare n int;
begin
  assert (select count(*) from public.studies) = 2, 'Carla ve sus 2 estudios';
  assert (select count(*) from public.visual_assets) = 0, 'Carla no ve piezas de Darío';
  assert (select count(*) from storage.objects) = 1, 'Carla sólo ve sus objetos del bucket';

  -- Puede subir a la carpeta de su estudio...
  insert into storage.objects (bucket_id, name) values ('study-assets', '20000000-0000-0000-0000-0000000000c1/c.png');
  -- ...pero no a la de Darío, ni a una ruta que no empiece con un UUID.
  begin
    insert into storage.objects (bucket_id, name) values ('study-assets', '20000000-0000-0000-0000-0000000000d1/x.png');
    raise exception 'Carla no debería subir al estudio de Darío';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('study-assets', 'sin-uuid/x.png');
    raise exception 'una ruta sin UUID debería rechazarse';
  exception when insufficient_privilege then null;
  end;
  delete from storage.objects where name like '20000000-0000-0000-0000-0000000000d1/%';
  get diagnostics n = row_count;
  assert n = 0, 'Carla no puede borrar objetos de Darío';

  insert into public.visual_assets (id, study_id, storage_path, file_name, mime_type, width, height, bytes, sha256, title)
    values ('40000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1',
            '20000000-0000-0000-0000-0000000000c1/c.png', 'c.png', 'image/png', 1080, 1080, 2048, 'abc', 'Pieza A');
  begin
    insert into public.visual_assets (study_id, storage_path, file_name, mime_type, width, height, bytes, sha256, title)
      values ('20000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d1/z.png', 'z.png', 'image/png', 1, 1, 1, 'x', 'Intrusa');
    raise exception 'Carla no debería crear piezas en el estudio de Darío';
  exception when insufficient_privilege then null;
  end;

  -- Columnas editables (AOIs) sí; identidad del archivo no.
  update public.visual_assets set aois = '[{"id":"A1"}]', aois_source = 'analyst'
    where id = '40000000-0000-0000-0000-0000000000c1';
  get diagnostics n = row_count;
  assert n = 1, 'Carla puede editar AOIs';
  begin
    update public.visual_assets set sha256 = 'otro' where id = '40000000-0000-0000-0000-0000000000c1';
    raise exception 'sha256 no debería ser editable';
  exception when insufficient_privilege then null;
  end;

  -- Calificaciones: valor 0–1 y justificación obligatoria.
  insert into public.friction_ratings (study_id, site_key, item_key, value, justification, evidence_asset_id, rubric_version)
    values ('20000000-0000-0000-0000-0000000000c1', 'principal', 'resenas_visibles', 0.5,
            'Reseñas visibles sólo en la ficha', '40000000-0000-0000-0000-0000000000c1', 'rubrica-0.1');
  begin
    insert into public.friction_ratings (study_id, site_key, item_key, value, justification, rubric_version)
      values ('20000000-0000-0000-0000-0000000000c1', 'principal', 'claridad_ficha', 0.5, 'corta', 'rubrica-0.1');
    raise exception 'una justificación de menos de 10 caracteres debería rechazarse';
  exception when check_violation then null;
  end;
  begin
    insert into public.friction_ratings (study_id, site_key, item_key, value, justification, rubric_version)
      values ('20000000-0000-0000-0000-0000000000c1', 'principal', 'claridad_ficha', 1.5, 'fuera de rango', 'rubrica-0.1');
    raise exception 'un valor > 1 debería rechazarse';
  exception when check_violation then null;
  end;

  -- Mediciones IFD: inmutables.
  insert into public.ifd_measurements (study_id, run_id, site_key, site_name, site_url, engine_version, ifd_version,
      calibration_version, rubric_version, seed, n_panel, inputs, summary, score, ifd, reading)
    values ('20000000-0000-0000-0000-0000000000c1', gen_random_uuid(), 'principal', 'Tienda', 'https://t.mx',
      'nf-journey-1.0', 'ifd-1.0', 'cal-mx-2026.1', 'rubrica-0.1', 1, 5000, '{}', '{}', 76.2, 23.8, 'media');
  begin
    update public.ifd_measurements set ifd = 1;
    raise exception 'las mediciones no deberían poder editarse';
  exception when insufficient_privilege then null;
  end;

  -- SEO: sólo las columnas de IA son editables.
  insert into public.seo_audits (id, study_id, mode, site_url, engine_version, summary)
    values ('50000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c2', 'live', 'https://t.mx', 'seo-1.0', '{}');
  update public.seo_audits set ai_result = '{}' where id = '50000000-0000-0000-0000-0000000000c1';
  begin
    update public.seo_audits set findings = '[]' where id = '50000000-0000-0000-0000-0000000000c1';
    raise exception 'los hallazgos no deberían poder editarse';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- Darío no ve nada de Carla
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
do $$
begin
  assert (select count(*) from public.friction_ratings) = 0;
  assert (select count(*) from public.ifd_measurements) = 0;
  assert (select count(*) from public.seo_audits) = 0;
  assert (select count(*) from public.visual_assets) = 1, 'Darío sólo ve su pieza';
  assert (select count(*) from storage.objects) = 1, 'Darío sólo ve su objeto';
end $$;

-- ---------------------------------------------------------------- anónimo
reset role;
set local role anon;
reset request.jwt.claim.sub;
do $$
begin
  begin
    perform count(*) from public.visual_assets;
    raise exception 'anon no debería leer piezas';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Cascada: borrar el estudio elimina piezas, calificaciones y mediciones.
reset role;
delete from public.studies where id = '20000000-0000-0000-0000-0000000000c1';
do $$
begin
  assert (select count(*) from public.visual_assets where study_id = '20000000-0000-0000-0000-0000000000c1') = 0;
  assert (select count(*) from public.friction_ratings where study_id = '20000000-0000-0000-0000-0000000000c1') = 0;
  assert (select count(*) from public.ifd_measurements where study_id = '20000000-0000-0000-0000-0000000000c1') = 0;
end $$;

rollback;
select 'TOOLS_OK' as result;
