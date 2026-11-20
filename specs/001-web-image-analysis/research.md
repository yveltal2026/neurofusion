# Research: Análisis de Imagen Web (001-web-image-analysis)

## 1. Reutilización de `visual_assets` vs. tabla nueva

- **Decisión**: Reutilizar la tabla `public.visual_assets` y el bucket `study-assets` existentes.
- **Justificación**: `visual_assets` ya modela `study_id` (FK a `studies`), `storage_path`, `mime_type`, dimensiones (`width`, `height`), `placement`, `site_key`, `task_id`, `position`, `metrics`, `ai_result` y `aois`, y sus políticas RLS validan pertenencia a la organización mediante `studies -> projects -> memberships`, sin restringir `studies.tool_type = 'visual'`.
- **Alternativa descartada**: Crear una tabla `web_visual_assets` duplicada generaría migraciones innecesarias y duplicaría el manejo de Storage y firma de URLs.

## 2. Nuevo `tool_type` en `studies` vs. submodo dentro de `visual`

- **Decisión**: Añadir `'web_visual'` como `tool_type` de primer nivel en `studies` (`CHECK` constraint) y en `src/tools/registry.ts`.
- **Justificación**: Permite que **Análisis de Imagen Web** tenga su propia tarjeta en la categoría web (`digital` · *¿Cómo funciona tu sitio?*), su propio contador/etiqueta en listados de proyectos y su propio flujo de configuración UX/CRO sin contaminar el wizard de piezas gráficas/anuncios (`visual`).
- **Compatibilidad hacia atrás**: Todos los estudios previos con `tool_type = 'visual'` (incluidos los que tienen `config.mode === 'journey'`) permanecen intactos y siguen despachándose por la rama `visual`.

## 3. Formatos de captura web (`placements`)

- **Decisión**: Reutilizar el grupo `"Web y correo"` de `src/tools/visual/engine/placements.ts` y añadir/exponer presets específicos para capturas web (p. ej. Desktop 1440×900, Desktop Full-Page, Mobile 390×844) en el selector del estudio `web_visual`.
- **Justificación**: Mantiene validación determinista de dimensiones y proporciones sin romper los IDs estables ya guardados en `visual_assets.placement`.
