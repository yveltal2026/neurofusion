# Data Model: Análisis de Imagen Web (001-web-image-analysis)

## 1. Cambio en Base de Datos (`supabase/migrations/`)

Se actualiza únicamente la restricción `CHECK` de `studies.tool_type` para aceptar `'web_visual'`:

```sql
alter table public.studies
  drop constraint if exists studies_tool_type_check;

alter table public.studies
  add constraint studies_tool_type_check
  check (tool_type in ('iat', 'seo', 'visual', 'survey', 'iat_variant', 'web_visual'));
```

No se requieren nuevas tablas ni cambios en políticas RLS, ya que `visual_assets` y `study-assets` heredan acceso por `study_id -> projects.org_id`.

## 2. Configuración del Estudio (`studies.config` para `tool_type = 'web_visual'`)

Esquema Zod (`webVisualConfigSchema` en `src/tools/web-visual/config.ts`):

- `mode`: `'single' | 'flow'` (capturas individuales o secuencia de pantallas)
- `pageType`: `'landing' | 'product' | 'checkout' | 'pricing' | 'dashboard' | 'other'`
- `deviceFocus`: `'desktop' | 'mobile' | 'both'`
- `objective`: string (1..600) — objetivo de negocio / conversión de la página
- `primaryCta`: string (0..160) — acción o botón principal esperado
- `audience`: string (0..400) — perfil de usuario objetivo (opcional)
- `brand`: string (0..120) — marca o sitio evaluado (opcional)

## 3. Activos de Captura (`public.visual_assets`)

Cada captura subida en un estudio `web_visual` se guarda en `visual_assets` con:
- `study_id`: UUID del estudio `web_visual`
- `position`: orden de la captura (0, 1, 2, …) para flujos de pantallas
- `placement`: identificador de formato web (`web_desktop_1440`, `web_mobile_390`, etc. o `null`)
- `metrics` / `ai_result` / `aois`: poblados por el pipeline determinista + IA UX/CRO
