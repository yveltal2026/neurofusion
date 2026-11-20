# COG-20261119-eyetracking-web — Eyetracking para Web (Sitio en Vivo y Sin Código)

- Fecha y responsable: 2026-11-19.
- Estado del trabajo: implementado localmente.
- Tipo: mejora.
- Alcance: compartido.
- Origen: `yveltal2026/neurofusion`, rama `main`, commit base `a28ec45`.
- Referencias de implementación: pendiente (implementación local sin commit/PR todavía).
- Dependencias de otros cambios (IDs): `COG-20261119-imagen-web-separada`.

## Problema y comportamiento esperado

Se añade el módulo **Eyetracking para Web** (`web_eyetracking`) dentro de **Diagnóstico digital** en Proyectos para medir recorridos de usuarios reales sobre sitios web guiados por pasos e instrucciones:
- **Modo Sitio en Vivo (`live_snippet`)**: el analista define URL objetivo y pasos, obtiene un `<script>` para `<head>` / GTM y los participantes entran por liga mágica (`/s/[token]`) con barra flotante de instrucciones y envío por lotes con CORS validado.
- **Modo Sin Código (`no_code_captures`)**: alternativa cuando no se puede instalar código en el sitio destino; el participante recorre los pasos dentro del runner propio de Aesteros.
- Motor determinista de normalización `(x, y, scrollY, viewport)` al documento y métricas por paso.

## Implementación

- `supabase/migrations/20261119010000_web_eyetracking.sql`: añade `'web_eyetracking'` a `studies` y crea `web_eyetracking_runs` con RLS.
- `src/lib/db/types.ts`, `src/tools/registry.ts`, `src/app/(app)/projects/[id]/studies/new/page.tsx`.
- `src/tools/web-eyetracking/config.ts`, `engine/normalize.ts`, `engine/metrics.ts`, `actions.ts`, `server.ts`.
- `src/tools/web-eyetracking/ui/new-study-form.tsx`, `overview.tsx`, `runner/WebEyeParticipantRunner.tsx`.
- `src/app/api/embed/web-eyetrack.js/route.ts`, `src/app/api/s/[token]/web-eyetrack/session/route.ts`, `events/route.ts`, `src/app/s/[token]/page.tsx`.

## Dependencias y configuración

- Migración SQL: `supabase/migrations/20261119010000_web_eyetracking.sql`.
- Variables de entorno nuevas: ninguna.

## Réplica

1. Aplicar `supabase/migrations/20261119010000_web_eyetracking.sql` en el destino.
2. Incorporar el commit de implementación cuando se integre en `main`.
3. Verificar alta del estudio, snippet en `<head>` en entorno de prueba y flujo de participante en `/s/[token]`.

## Compatibilidad universitaria (obligatorio por destino)

- Edición y perfil: plataforma principal (`yveltal2026/neurofusion`, `main`).
- Impacto en registro, autenticación, roles, permisos, dominios y altas de alumnos: no. Sólo agrega `tool_type = 'web_eyetracking'` bajo RLS existente y endpoints públicos de participante `/api/s/[token]/web-eyetrack/*` con `service_role`.
- Adaptación necesaria: ninguna en autenticación/roles.
- Acreditación de maestro y dominios autorizados: no aplica.
- Acceso de alumnos: no aplica (los participantes entran por liga mágica anónima sin cuenta).
- Comprobaciones: revisión de diff sin cambios en `src/lib/auth/*` ni `src/app/(auth)/*`.
- Conclusión para el destino: compatible en plataforma madre (pendiente de integrar en `main`); Anáhuac Mayab y otras universidades sin verificar hasta aplicar en su repositorio.

## Validación y limitaciones

- Comandos ejecutados: `npm run typecheck`, `npm run lint`, pruebas unitarias en `src/tools/web-eyetracking/` y `new/page.test.tsx`.
- Limitaciones: pendiente de validar con Supabase real, cámara física y sitio externo real con `<script>` embebido. Ver fila en `docs/backlog/ADOPCION.md`.

## Recuperación

- Revertir el código y eliminar/migrar filas con `tool_type = 'web_eyetracking'` antes de revertir la migración SQL.

## Historial de la ficha

- 2026-11-19: creación de la ficha e implementación local inicial.
