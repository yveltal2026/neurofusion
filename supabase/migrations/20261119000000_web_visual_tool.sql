-- Fase 1 (Servicios Web): separa Análisis de Imagen Web (`web_visual`)
-- del módulo de piezas gráficas (`visual`), reutilizando `visual_assets`.

alter table public.studies drop constraint studies_tool_type_check;
alter table public.studies add constraint studies_tool_type_check
  check (tool_type in ('iat', 'seo', 'visual', 'survey', 'iat_variant', 'web_visual'));
