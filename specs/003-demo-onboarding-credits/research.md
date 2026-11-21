# Research: Registro Público DEMO, Límites/Créditos, Membresía por Perfil y Onboarding Gamificado

**Feature**: `003-demo-onboarding-credits` | **Date**: 2026-11-20

## 1. Captura de perfil de audiencia en registro público y confirmación de correo

- **Decision**: Guardar `audience_segment` (`researcher | agency_company | teacher | student | other`) y `declared_organization` (opcional, máx. 120 caracteres) en `auth.users.raw_user_meta_data` desde [`signUp`](file:///home/antigravity/yveltal2026/neurofusion/src/lib/auth/actions.ts#L51-L79), validados con Zod, y procesarlos dentro del trigger PostgreSQL [`handle_new_user`](file:///home/antigravity/yveltal2026/neurofusion/supabase/migrations/20261009000000_init.sql#L30-L51).
- **Rationale**: Si Supabase Auth tiene habilitada la confirmación de correo, `signUp()` no abre sesión de inmediato; persistir los metadatos en el trigger asegura que `profiles`, `organizations`, el plan inicial `demo` y el movimiento de crédito inicial (`+30`) se creen de forma atómica al insertar el usuario, sin depender de que el cliente vuelva a enviar nada en el primer login. Si el cliente intenta enviar `plan` o `credits` en `raw_user_meta_data`, el trigger los ignora por completo.
- **Alternatives considered**: Guardar en una tabla temporal o actualizar el perfil después del primer login. Se descartó porque introduce estados intermedios sin organización con plan ni créditos iniciales si el usuario entra desde el enlace de confirmación.

## 2. Arquitectura de créditos y atomicidad contra concurrencia

- **Decision**: Usar un **ledger inmutable (*append-only*)** `credit_ledger` asociado a `org_id` junto con un RPC `consume_org_credits(p_org_id, p_amount, p_event_type, p_ref_id, p_idempotency_key)` y `grant_org_credits(...)` con bloqueo `FOR UPDATE` sobre la fila de `organizations`.
- **Rationale**: Evita condiciones de carrera cuando dos pestañas ejecutan análisis con IA simultáneamente (no puede quedar el saldo negativo) y garantiza idempotencia en bonos de onboarding y códigos de activación mediante índice único `(org_id, idempotency_key)`. Si una llamada a proveedor externo de IA falla, el servidor emite un reintegro (`refund`) con clave `refund:<consume_ledger_id>` para no cobrar análisis fallidos.
- **Alternatives considered**: Un campo `credits_balance` actualizado directamente con `UPDATE` desde TypeScript. Se descartó porque sin bloqueo transaccional e historial inmutable es vulnerable a carreras y pierde trazabilidad para el usuario.

## 3. Aplicación de topes DEMO en proyectos, estudios y respuestas

- **Decision**: Centralizar las reglas de plan en un módulo puro compartido (`src/lib/plans/quotas.ts`) y reforzarlas en tres capas:
  1. **Base de datos (`claim_session` y acciones de servidor)**: `claim_session` consulta el plan de la organización del estudio y aplica `least(coalesce(s.max_responses, 15), 15)` cuando la organización está en `demo` (mismo patrón para `web_eyetracking` y baterías).
  2. **Helper de servidor `assertOrgQuota(supabase, orgId, action)`**: invocado en `createProject`, todas las acciones de creación/duplicación de estudios (8 herramientas + `duplicateStudy`) y acciones de IA/SEO.
  3. **UI contextual**: banners y deshabilitación informativa con enlace directo a `/membresia` y al checklist de onboarding.
- **Rationale**: Mantiene consistencia total entre lo que ve el investigador y la autoridad estricta del servidor exigida por la Constitución (Principio II).
- **Alternatives considered**: Confiar únicamente en políticas RLS `CHECK` con subconsultas complejas. Se descartó para las cuotas con mensajes explicativos porque las acciones de servidor devuelven mensajes accionables en español al usuario (`ProjectFormState` / `SettingsState`), manteniendo además RLS para aislamiento entre organizaciones.

## 4. Onboarding interactivo, tour guiado y gamificación

- **Decision**: Persistir el estado de onboarding en `onboarding_progress` por usuario/organización con 4 misiones verificables en servidor (`profile_confirmed`, `first_project`, `first_study`, `explored_tool_or_tour`), acompañadas de un **checklist interactivo** en [`ProjectsPage`](file:///home/antigravity/yveltal2026/neurofusion/src/app/(app)/projects/page.tsx) y un **tour guiado opcional** tipo *spotlight/drawer* paso a paso accesible desde el checklist y desde el menú/barra superior.
- **Rationale**: El usuario pidió explícitamente un checklist interactivo con opción de ver tour guiado y gamificación de créditos extra (+30 créditos: +5 por misión 1, +10 por misión 2, +10 por misión 3 y +5 por misión 4 o bono al completar). Validar misiones de creación (`first_project`, `first_study`) consultando las tablas reales en servidor impide que alguien simule completitud por API. El tour guiado respeta `prefers-reduced-motion` y puede cerrarse y reabrirse sin bloquear el trabajo.
- **Alternatives considered**: Un tour modal obligatorio bloqueante en el primer login. Se descartó porque interrumpe al usuario experimentado; el checklist no bloqueante + botón de tour guiado logra ambas metas.

## 5. Crecimiento de membresía adaptado al perfil y compatibilidad universitaria

- **Decision**: Crear la ruta `/membresia` dentro de `(app)` con catálogo dinámico según `audience_segment` (segmento académico: *Docente* / *Estudiante* vs. segmento comercial/profesional: *Agencia/Empresa* / *Investigador/Consultor* / *Otro*), formulario de solicitud de ascenso/licencia (`membership_requests`) y canje atómico de códigos (`activation_codes`).
- **Rationale**: Sin pasarela de pago configurada todavía, permite captar demanda real diferenciada por perfil y habilitar activaciones controladas (p. ej. códigos beta o académicos). Mantiene aislamiento estricto respecto a ediciones universitarias (`docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md`): la apertura de registro DEMO público se documenta en `docs/backlog/` como exclusiva del flujo público de la plataforma madre, dejando un interruptor de configuración explícito si en una edición universitaria se restringe el autorregistro.
- **Alternatives considered**: Integrar Stripe desde esta primera fase. Se descartó por no existir credenciales ni webhooks en el entorno actual y porque los usuarios académicos requieren validación/licencia institucional más allá de una tarjeta.
