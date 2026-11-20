<!--
Sync Impact Report:
- Version change: template -> 1.0.0
- Modified principles: Initial ratification of 5 core Aesteros/NeuroFusion principles
- Added sections: Stack y Restricciones Técnicas, Flujo de Desarrollo y Calidad, Governance
- Removed sections: None
- Follow-up TODOs: None
-->

# Aesteros (NeuroFusion) Constitution

## Core Principles

### I. Motores Deterministas e IA sólo sobre Agregados
Toda la lógica de puntuación, métricas, validez estadística, mapas de calor y cálculos cuantitativos MUST residir en módulos puros y testeados (`src/tools/<tool>/engine`). Los modelos de IA MUST utilizarse únicamente para redactar, priorizar o analizar sobre agregados ya calculados (o estímulos multimedia acotados) y MUST NEVER recibir filas crudas de participantes ni datos personales.

### II. Autoridad del Servidor y Privacidad por Defecto
El servidor MUST NOT confiar en cálculos, estados o validaciones enviados por el cliente. Los endpoints públicos de participantes (`/api/s/*`) MUST validar el token de liga mágica y operar con `service_role` aplicando controles atómicos de sesión; las rutas del investigador MUST respetar estrictamente Supabase RLS por `org_id`. Nunca se almacena la IP del participante en claro (sólo hash/HMAC por estudio).

### III. Herramientas Modulares dentro de Proyectos
Cada instrumento de investigación MUST registrarse en `src/tools/registry.ts` dentro de `TOOL_CATEGORIES` y `TOOLS`, manteniendo su propio esquema de configuración validado con Zod, motor, UI y vistas de resultados aislados bajo `src/tools/<tool>/`. Las nuevas capacidades web se integran como tipos de estudio dentro de Proyectos, manteniendo la experiencia unificada de la plataforma.

### IV. Trazabilidad en Backlog y Compatibilidad Universitaria (NON-NEGOTIABLE)
Todo cambio de producto, datos, infraestructura o documentación MUST registrarse en `docs/backlog/` usando `docs/backlog/PLANTILLA.md`, actualizando `docs/backlog/README.md` y `docs/backlog/ADOPCION.md` únicamente con evidencia verificable. Todo cambio MUST respetar `docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md`: distinguir maestros y alumnos, impedir el autorregistro de alumnos y nunca sobrescribir autenticación, roles o dominios institucionales en réplicas.

### V. Puertas de Calidad y Verificación Real
Ninguna implementación se considera terminada sin pasar `npm run typecheck`, `npm run lint` y las pruebas unitarias/componentes en Vitest (`npm test`). Los cambios de esquema o políticas RLS MUST documentarse en `supabase/migrations/` y validarse sin asumir entornos de producción no verificados.

## Stack y Restricciones Técnicas

- **Framework y Lenguaje:** Next.js 16 (App Router, `proxy.ts` en lugar de `middleware.ts`, `params`/`searchParams`/`cookies()` asíncronos), TypeScript estricto y Tailwind CSS.
- **Base de Datos y Storage:** Supabase (Postgres, Auth, RLS, Storage).
- **Validación y Visualización:** Zod para contratos y configuración; Recharts para gráficas; Vitest y Playwright para pruebas.
- **Proveedores Externos:** SDKs de Anthropic / OpenAI en `src/lib/ai/` y APIs externas (como DataForSEO) exclusivamente desde servidor con credenciales en variables de entorno.

## Flujo de Desarrollo y Calidad

- **Spec-Driven Development:** Las nuevas funcionalidades siguen el flujo de Spec Kit (`speckit-specify` → `speckit-plan` → `speckit-tasks` → `speckit-implement`) antes de modificar código productivo.
- **Integridad de Documentación:** Se preservan comentarios y docstrings existentes no relacionados con el cambio y se actualizan las fichas de `docs/backlog/` en la misma entrega.

## Governance

Esta constitución prevalece sobre prácticas ad-hoc y complementa las reglas operativas de `AGENTS.md`. Toda especificación (`/speckit-specify`) y plan técnico (`/speckit-plan`) MUST verificar su cumplimiento antes de iniciar la implementación. Las enmiendas requieren actualizar la versión semántica (MAJOR para cambios incompatibles, MINOR para nuevos principios o secciones, PATCH para aclaraciones) y la fecha de última modificación.

**Version**: 1.0.0 | **Ratified**: 2026-11-19 | **Last Amended**: 2026-11-19
