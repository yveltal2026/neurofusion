# Quickstart & Validation Guide: Demo, Credits, Onboarding & Membership

**Feature**: `003-demo-onboarding-credits` | **Date**: 2026-11-20

## Prerrequisitos

1. Aplicar la migración SQL `supabase/migrations/20261120000000_demo_onboarding_credits.sql` en el proyecto Supabase.
2. Variables `.env.local` configuradas (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
3. Ejecutar verificaciones base:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   ```

## Escenarios de Validación End-to-End

### Escenario 1: Registro con segmento de audiencia y arranque DEMO
1. Abrir `/entrar` y cambiar a **Crear nuevo usuario**.
2. Verificar que no permite enviar sin seleccionar "¿Qué perfil te describe mejor?".
3. Seleccionar **Docente** (o **Agencia / Marca / Empresa**), ingresar correo, contraseña y organización opcional.
4. Confirmar entrada en `/projects`:
   - La barra superior muestra etiqueta `DEMO` y `30 créditos`.
   - El perfil en DB conserva `audience_segment`.

### Escenario 2: Onboarding interactivo + tour guiado + gamificación
1. En `/projects`, verificar el checklist con barra de progreso (`0/4` o `1/4` si perfil ya confirmado).
2. Hacer clic en **Iniciar tour guiado**, recorrer los pasos y finalizar.
3. Verificar que la misión del tour se marca completa y el saldo sube (`+5 créditos`).
4. Crear 1 proyecto (`+10 créditos`) y 1 estudio (`+10 créditos` + completitud).
5. Verificar en `/membresia` el historial de créditos sin duplicados.

### Escenario 3: Límites DEMO y consumo/reintegro de créditos
1. Con 1 proyecto creado en DEMO, intentar crear un segundo proyecto → error claro y enlace a `/membresia`.
2. Con 3 estudios creados en el proyecto, intentar crear un cuarto estudio → bloqueo con aviso de límite DEMO.
3. Ejecutar un análisis con IA o auditoría SEO → descuento exacto en `credit_ledger`.
4. Simular saldo 0 e intentar ejecutar análisis con IA → bloqueo previo antes de llamar al proveedor IA.

### Escenario 4: Membresía personalizada por perfil
1. Entrar como usuario registrado como **Docente** → `/membresia` prioriza planes académicos y solicitud de licencia institucional.
2. Entrar como usuario registrado como **Agencia / Marca / Empresa** → `/membresia` prioriza planes Pro/Equipo y cotización comercial.
3. Enviar solicitud → se guarda en `membership_requests` con estado `pending`.
4. Canjear un código de activación válido → actualiza plan o suma créditos al instante.
