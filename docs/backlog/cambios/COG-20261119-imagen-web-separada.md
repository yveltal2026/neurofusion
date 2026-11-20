# COG-20261119-imagen-web-separada — Separar Análisis de Imagen Web

- Fecha y responsable: 2026-11-19.
- Estado del trabajo: implementado localmente.
- Tipo: mejora.
- Alcance: compartido.
- Origen: `yveltal2026/neurofusion`, rama `main`, commit base `a28ec45`.
- Referencias de implementación: pendiente (implementación local sin commit/PR todavía).
- Dependencias de otros cambios (IDs): ninguna.

## Problema y comportamiento esperado

El análisis visual (`visual`) agrupaba tanto piezas gráficas/anuncios como capturas de pantalla web y flujos digitales. Se separa **Análisis de Imagen Web** (`web_visual`) como un tipo de estudio propio dentro de la categoría **Diagnóstico digital** en Proyectos:
- El investigador selecciona **Análisis de Imagen Web** en `/projects/[id]/studies/new`.
- Configura modo (capturas individuales o flujo de pantallas), tipo de página, dispositivo objetivo, objetivo principal y CTA esperado.
- Sube capturas del sitio a `visual_assets` / `study-assets` y ejecuta el análisis determinista + IA con contexto UX/CRO especializado.
- Los estudios previos de tipo `visual` conservan compatibilidad total hacia atrás.

## Implementación

- `supabase/migrations/20261119000000_web_visual_tool.sql`: amplía `studies_tool_type_check` para incluir `'web_visual'`.
- `src/lib/db/types.ts`: añade `'web_visual'` a `StudyRow.tool_type`.
- `src/tools/registry.ts`: registra `web_visual` en categoría `digital` y enfoca la descripción de `visual` en piezas gráficas, anuncios e impresos.
- `src/tools/web-visual/config.ts` y `config.test.ts`: esquema Zod (`webVisualConfigSchema`) y pruebas unitarias.
- `src/tools/web-visual/analysis/prompt.ts` y `prompt.test.ts`: constructor de contexto UX/CRO para capturas web.
- `src/tools/web-visual/actions.ts`, `ui/new-study-form.tsx`, `ui/overview.tsx`: creación, configuración y vista general del estudio `web_visual`.
- `src/app/(app)/projects/[id]/studies/new/web-visual/page.tsx`: página de alta.
- `src/tools/visual/load.ts`, `src/tools/visual/actions.ts`, `src/app/(app)/studies/[id]/page.tsx`, `actions.ts`, `report/page.tsx`: soporte de carga, análisis, borrado de archivos y reporte para `web_visual`.

## Dependencias y configuración

- Migración SQL: `supabase/migrations/20261119000000_web_visual_tool.sql` (aplicar antes o junto con el despliegue de la app).
- Variables de entorno nuevas: ninguna.

## Réplica

1. Aplicar `supabase/migrations/20261119000000_web_visual_tool.sql` en el destino.
2. Incorporar el commit de implementación cuando se integre en `main`.
3. Verificar creación de un estudio `web_visual`, carga de captura, ejecución de análisis y apertura de estudios `visual` previos.

## Compatibilidad universitaria (obligatorio por destino)

- Edición y perfil: plataforma principal (`yveltal2026/neurofusion`, `main`). Reglas en `docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md`.
- Impacto en registro, autenticación, roles, permisos, dominios y altas de alumnos: no. Sólo agrega un `tool_type` dentro de `studies` protegido por las políticas RLS existentes de `projects -> memberships`.
- Adaptación necesaria: ninguna en autenticación/roles.
- Acreditación de maestro y dominios autorizados: no aplica a este cambio; conservar el mecanismo del destino.
- Acceso de alumnos: no aplica (herramienta de análisis para investigadores/analistas).
- Comprobaciones: revisión de diff sin cambios en `src/lib/auth/*`, `src/app/(auth)/*` ni tablas de usuarios/membresías.
- Conclusión para el destino: compatible en plataforma madre (pendiente de integrar en `main`); Anáhuac Mayab y otras universidades sin verificar hasta aplicar en su repositorio.

## Validación y limitaciones

- Comandos ejecutados: `npm run typecheck`, `npm run lint`, `npm test` (verificados en entorno local tras los cambios).
- Limitaciones: no ejecutado contra instancia real de Supabase ni con API key real de IA en esta sesión; `scripts/verify-sql.sh` no ejecutado. Ver fila en `docs/backlog/ADOPCION.md`.

## Recuperación

- Revertir el código y, si no existen filas con `tool_type = 'web_visual'`, restaurar el `CHECK` anterior de `studies_tool_type_check`. Si ya existen estudios `web_visual`, migrarlos o archivarlos antes de restringir el `CHECK`.

## Historial de la ficha

- 2026-11-19: creación de la ficha e implementación local inicial.
