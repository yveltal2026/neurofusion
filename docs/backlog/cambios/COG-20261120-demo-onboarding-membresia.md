# COG-20261120-demo-onboarding-membresia — Registro público DEMO, límites/créditos, membresía por perfil y onboarding gamificado

- Fecha y responsable: 2026-11-20 · Aesteros / NeuroFusion
- Estado del trabajo: integrado en `main` mediante [PR #29](https://github.com/yveltal2026/neurofusion/pull/29) (migración confirmada por propietario en Supabase; verificación funcional en producción pendiente)
- Tipo: mejora / datos / configuración
- Alcance: Plataforma principal (Aesteros); ediciones universitarias requieren adaptación y conservar su política de acceso
- Origen: `yveltal2026/neurofusion`, rama `feat/003-demo-onboarding-credits`, base `6244632`
- Referencias de implementación: `f39cbe5`, [PR #29](https://github.com/yveltal2026/neurofusion/pull/29)
- Dependencias de otros cambios (IDs): `COG-20261028-compatibilidad-universitaria`

## Problema y comportamiento esperado

Al abrir la plataforma principal Aesteros al público, un visitante nuevo necesita registrarse por primera vez en una modalidad `DEMO` limitada sin poner en riesgo costos de cómputo/IA ni perder visibilidad sobre qué audiencia llega a la plataforma.

Comportamiento implementado:
1. **Registro con segmento de audiencia (`/entrar`)**: exige elegir qué perfil representa (*Investigador / Consultor*, *Agencia / Marca / Empresa*, *Docente*, *Estudiante*, *Otro* + detalle opcional) y organización opcional. En servidor, `handle_new_user()` siempre asigna `plan_tier = 'demo'` y **30 créditos iniciales** (`initial_demo_grant`), ignorando cualquier plan o saldo enviado por el cliente.
2. **Límites DEMO y ledger de créditos**: aplica topes estructurales en `demo` (`1` proyecto, `3` estudios, `15` respuestas por estudio en `claim_session` y `web-eyetrack/session`) y cobro atómico de créditos (`consume_org_credits`) en acciones con IA y auditorías en vivo (`ai_analysis`: 5, `visual_ai`: 5, `seo_audit`: 10, `ai_suggest`: 2) con reintegro automático (`refund`) si falla un proveedor externo o el guardado.
3. **Onboarding interactivo con tour guiado y gamificación**: muestra un checklist interactivo no bloqueante de 4 misiones en `/projects` con opción de abrir un tour guiado paso a paso (cerrable y reabrible, respetando `prefers-reduced-motion`) y otorga **+30 créditos extra** idempotentes (`+5`, `+10`, `+10`, `+5`) para duplicar el saldo inicial hasta 60 créditos.
4. **Espacio de membresía adaptado al perfil (`/membresia`)**: muestra consumo frente a topes, badge en cabecera, historial de `credit_ledger`, ofertas adaptadas al segmento seleccionado al registrarse (rutas/licencias académicas vs. planes Pro/Agencia/créditos), formulario de solicitud persistido en `membership_requests` y canje atómico de códigos (`activation_codes`).

## Implementación

- Especificación y diseño Spec Kit: `specs/003-demo-onboarding-credits/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/demo-membership-api.md`, `quickstart.md`, `tasks.md`).
- Base de datos y RLS: `supabase/migrations/20261120000000_demo_onboarding_credits.sql` y `src/lib/db/types.ts`.
- Reglas puras y servidor: `src/lib/plans/quotas.ts`, `src/lib/plans/server.ts`, `src/lib/onboarding/missions.ts`, `src/lib/onboarding/actions.ts`.
- Autenticación y UI:
  - `src/components/entrar-screen.tsx`, `src/lib/auth/actions.ts`
  - `src/components/plan-credit-badge.tsx`, `src/app/(app)/layout.tsx`, `src/components/workspace-nav.tsx`
  - `src/components/onboarding/onboarding-checklist.tsx`, `src/components/onboarding/guided-tour-modal.tsx`
  - `src/components/membership/membership-hub.tsx`, `src/app/(app)/membresia/page.tsx`, `src/app/(app)/membresia/actions.ts`
- Guardias de cuota y créditos:
  - Proyectos y estudios: `src/app/(app)/projects/page.tsx`, `src/app/(app)/projects/actions.ts`, `src/app/(app)/studies/[id]/actions.ts`, `src/tools/{iat/wizard,variants/wizard,survey/builder,seo,visual,web-visual,eyetracking,web-eyetracking}/actions.ts`
  - Acciones IA / crawl: `src/app/(app)/studies/[id]/analysis/actions.ts`, `src/tools/reports/actions.ts`, `src/tools/seo/actions.ts`, `src/tools/visual/actions.ts`, `src/tools/iat/wizard/ai-actions.ts`
  - Participantes web-eyetracking: `src/app/api/s/[token]/web-eyetrack/session/route.ts`
- Pruebas agregadas: `src/lib/plans/quotas.test.ts`, `src/lib/plans/server.test.ts`, `src/lib/plans/rls-audit.test.ts`, `src/lib/onboarding/missions.test.ts`, `src/components/onboarding/onboarding.test.tsx`, `src/components/membership/membership-hub.test.tsx` y actualización de `src/components/entrar-screen.test.tsx`.

## Dependencias y configuración

- Aplicar la migración `supabase/migrations/20261120000000_demo_onboarding_credits.sql` en Supabase antes de desplegar el código de aplicación.
- Sin nuevas variables de entorno ni secretos adicionales.

## Réplica

Pendiente de generar commits/PR. Antes de portar a una edición universitaria, revisar obligatoriamente el apartado siguiente.

## Compatibilidad universitaria (obligatorio por destino)

- Edición y perfil:
  - **Plataforma principal Aesteros (`yveltal2026/neurofusion`)**: apertura pública habilitada con modalidad `DEMO`.
  - **Anáhuac Mayab / futuras ediciones universitarias (`docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md`)**: conservan restricción de autorregistro exclusivo para maestros acreditados con dominio institucional autorizado; los alumnos **no pueden autorregistrarse**.
- Impacto en registro, autenticación, roles, permisos, dominios y altas de alumnos: **sí** en la plataforma principal (`src/components/entrar-screen.tsx`, `src/lib/auth/actions.ts`, `handle_new_user()`).
- Adaptación necesaria para universidades: **No copiar** el flujo de autorregistro abierto (`EntrarScreen` / `signUp`) a una edición universitaria. En cualquier réplica universitaria, conservar intacto el bloqueo de autorregistro de alumnos y el mecanismo institucional para acreditar maestros; los módulos de cuotas/créditos/onboarding/membresía pueden portarse de forma independiente si se desea.
- Acreditación de maestro y dominios autorizados: pendiente de identificar en destinos universitarios; la selección *Docente* o *Estudiante* en la plataforma pública sólo segmenta audiencia y catálogo comercial/académico, y **no acredita** rol universitario.
- Acceso de alumnos: sin cambios en mecanismo de destino; no se habilita autorregistro de alumnos en ediciones universitarias.
- Comprobaciones: sin acceso a repositorios universitarios (`sin verificar`).
- Conclusión para el destino: **Plataforma principal**: implementado localmente. **Anáhuac Mayab y futuras universidades**: **requiere adaptación / sin verificar**.

## Validación y limitaciones

Comandos ejecutados localmente tras la última edición:
- `npm run typecheck`: correcto (0 errores).
- `npm run lint`: correcto (0 errores).
- `npx vitest run` sobre las 13 suites afectadas y nuevas (`entrar-screen.test.tsx`, `membership-hub.test.tsx`, `onboarding.test.tsx`, `quotas.test.ts`, `server.test.ts`, `rls-audit.test.ts`, `missions.test.ts`, `seo/actions.test.ts`, `visual/actions.analysis.test.ts`, `eyetracking/video-actions.test.ts`, `reports/actions.test.ts`, `survey/builder/actions.test.ts`, `actions.duplicate.test.ts`): **13 archivos / 57 pruebas correctas**.
- Nota en suite completa previa (`npm test`): 143 de 148 archivos (1,320 pruebas) correctos; los 4 fallos ligados a `plans/server.ts` quedaron corregidos y verificados en la corrida posterior; persiste el fallo preexistente en `src/app/s/[token]/page.test.tsx` (originado en `c4f95c4` por importar `web-eyetracking/server` con `server-only` sin mockear).
- Check de preview en Vercel para [PR #29](https://github.com/yveltal2026/neurofusion/pull/29) aprobado (`https://vercel.com/neurofusion1/neurofusion/DamLxuXWEXnavdc7nGg9DXG5j289`).
- El propietario confirmó el 2026-11-20 que ya aplicó la migración `20261120000000_demo_onboarding_credits.sql` en Supabase (entorno real sin acceso directo desde este agente para consulta independiente).
- Limitaciones pendientes: verificación funcional en navegador real de los escenarios de `specs/003-demo-onboarding-credits/quickstart.md`, merge de [PR #29](https://github.com/yveltal2026/neurofusion/pull/29) y conexión futura con pasarela de pagos (Stripe) si se habilita cobro automático.

## Recuperación

Para revertir la funcionalidad en aplicación basta revertir los componentes/guardias; en base de datos, las nuevas tablas (`credit_ledger`, `onboarding_progress`, `membership_requests`, `activation_codes`, `activation_redemptions`) y columnas con default seguro (`plan_tier = 'demo'`) no alteran datos históricos de proyectos ni estudios existentes.

## Historial de la ficha

- 2026-11-20: Creación de ficha, especificación/plan en `specs/003-demo-onboarding-credits/`, implementación completa local y validación de tipos, lint y pruebas unitarias/componentes.
- 2026-11-20: Rama `feat/003-demo-onboarding-credits` (`f39cbe5`), [PR #29](https://github.com/yveltal2026/neurofusion/pull/29) abierto con check de Vercel aprobado; propietario confirma aplicación de migración en Supabase.
