# NeuroFusion

Plataforma para diseñar, aplicar y analizar estudios de neuromarketing. Hoy es de uso educativo/demostrativo; la arquitectura (organizaciones, RLS, herramientas registrables) está pensada para convertirse en un SaaS. Tres herramientas:

| Herramienta | Para qué |
|---|---|
| **IAT** (Test de Asociación Implícita) | Asociaciones implícitas con participantes reales vía liga mágica |
| **Auditoría SEO** | Rastreo, on-page, datos estructurados, enlaces y Core Web Vitals; plan de acción redactado por IA |
| **Análisis visual con IA** | Piezas gráficas y capturas web (mapa de atención estimado, recorrido, zonas ciegas, métricas de imagen) y modo journey con rúbrica e Índice de Fricción Digital (IFD) |

SEO y Visual provienen del módulo NeuroSEO; decisiones, modelo y pendientes en [`docs/HERRAMIENTAS_SEO_VISUAL.md`](docs/HERRAMIENTAS_SEO_VISUAL.md). Lo que sigue en «Qué hace» describe el flujo del IAT.

## Qué hace

1. El investigador crea un **proyecto** (un proyecto podrá agrupar varias herramientas).
2. Crea un **estudio IAT** con un wizard de 7 pasos (producto, conceptos, dimensiones, palabras, rigor, datos del participante, identidad visual) que reproduce el interrogatorio de la skill `iat-study-builder`.
3. Se genera una **liga mágica** que comparte con N participantes. Puede cerrarse, limitarse por número de respuestas o fecha, regenerarse o probarse en **vista previa** (no guarda datos).
4. Los participantes: consentimiento → los datos que el investigador pidió → test (teclado **o** botones táctiles en celular) → agradecimiento. **No ven resultados.**
5. Los datos se almacenan centralmente. El investigador consulta **datos crudos** (tabla, detalle por sesión, exclusiones, CSV) o pide un **análisis** con estadísticos, gráficas y conclusiones redactadas por IA.

## Principios de diseño

- **Matemática determinista y testeada.** Bloques, contrabalanceo, D-score, validez y estadísticos viven en `src/tools/iat/engine` (código puro, sin I/O). La IA **sólo redacta** sobre agregados ya calculados y **nunca recibe filas crudas ni datos personales**.
- **El servidor no confía en el cliente.** El servidor decide el contrabalanceo y una semilla por dimensión; con ellas regenera exactamente el plan de ensayos, valida lo que envía el cliente (sólo tiempos y teclas) y recalcula el D-score.
- **Privacidad por defecto.** No se pide correo ni nombre al participante; la IP sólo se guarda como HMAC por estudio; los CSV no incluyen identificadores de dispositivo.

Detalles metodológicos en [`docs/METODOLOGIA.md`](docs/METODOLOGIA.md) (IAT) y [`docs/HERRAMIENTAS_SEO_VISUAL.md`](docs/HERRAMIENTAS_SEO_VISUAL.md) (SEO y Visual).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, RLS) · Zod · Recharts · Vitest · Playwright. IA: SDK oficial de Anthropic (por defecto) u OpenAI.

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Aplica las migraciones de `supabase/migrations` en orden (`supabase db push`, o pegando el SQL en el editor). La migración `20261013000000_seo_visual_tools.sql` también crea el bucket privado de Storage `study-assets` y sus políticas.
3. En *Authentication → Providers* habilita **Email** y, si lo quieres, **Google** (necesitas credenciales OAuth de Google Cloud). Añade `http://localhost:3000/auth/callback` (y la URL de producción) a las *Redirect URLs*.
4. Copia URL, `anon key` y `service_role key` (*Project Settings → API*).

### 2. Variables de entorno
```bash
cp .env.example .env.local
```
Completa las de Supabase, `PARTICIPANT_LOCK_SECRET` (`openssl rand -hex 32`) y el proveedor de IA:

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente del investigador (respeta RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sólo servidor: endpoints públicos del participante. **Nunca exponer.** |
| `PARTICIPANT_LOCK_SECRET` | Firma de la cookie de dispositivo y HMAC de IP |
| `AI_PROVIDER` | `anthropic` (default) u `openai` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Modelo por defecto: `claude-opus-5-5` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | El modelo se exige explícitamente. Para la herramienta visual debe ser un modelo con visión |
| `PAGESPEED_API_KEY` | Opcional. Clave de PageSpeed Insights (Google Cloud) para Core Web Vitals en la auditoría SEO; sin ella la cuota es muy baja |

### 3. Correr
```bash
npm install
npm run dev
npm run seed:demo -- tu@correo.com   # opcional: estudio de demo con 36 participantes simulados
```

### 4. Desplegar en Vercel
Importa el repositorio, define las mismas variables de entorno y añade `NEXT_PUBLIC_APP_URL` con la URL pública. El análisis con IA, la auditoría SEO en vivo y la visión pueden tardar: esas rutas declaran `maxDuration = 120` (requiere un plan de Vercel que lo permita).

- **Rama de producción: `main`.** Vercel publica producción desde `main` (Settings → Environments → Production → Branch Tracking). Las demás ramas generan sólo *previews*. Para publicar algo, se mergea a `main`.
- **Variables obligatorias en el proyecto de Vercel** (no en las del equipo), con los entornos Production y Preview marcados: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (la integración de Supabase las crea) y `PARTICIPANT_LOCK_SECRET` (a mano). Tras cambiar variables hay que redesplegar: las `NEXT_PUBLIC_*` se fijan al construir.
- **Migraciones:** Vercel no las ejecuta. Aplica en Supabase todo `supabase/migrations/*.sql` en orden, y la URL `https://<tu-dominio>/auth/callback` debe estar en *Authentication → URL Configuration*.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run lint` / `npm run typecheck` | Lint y tipos |
| `npm test` | Pruebas unitarias y de componentes (Vitest) |
| `npm run test:e2e` | E2E con Playwright (requiere `E2E_EMAIL`/`E2E_PASSWORD` de un usuario real) |
| `scripts/verify-sql.sh` | Valida migraciones y RLS en un Postgres desechable (variables `PG*`) |
| `npm run seed:demo -- correo [n]` | Siembra datos de demostración simulados |

## Seguridad y candado anti-repetición

- **RLS** en todas las tablas: el investigador sólo ve datos de su organización; el rol anónimo no tiene acceso. Los participantes entran únicamente por `/api/s/*` (service role + validación del token).
- **Candado** (`duplicate_policy` por estudio): cookie de dispositivo firmada `httpOnly` (bloquea a quien ya completó) y, opcionalmente, marca de posibles duplicados por IP+navegador (no bloquea, porque en un salón de clase muchos comparten IP). El alta de sesión es atómica (`claim_session`) para que el límite de respuestas no se salte con peticiones simultáneas.
- **Límites conocidos:** ningún candado sin identidad real es infalible (modo incógnito u otro dispositivo lo evaden); sirve como disuasivo y deja trazabilidad para depurar la muestra. El limitador de peticiones es en memoria (por instancia); para SaaS conviene uno compartido (Redis/KV).

## Estado de verificación

| Área | Verificación |
|---|---|
| Motor IAT, configuración, sesión, estadísticos, CSV, IA (con proveedor falso), demo | Pruebas unitarias (Vitest) |
| Wizard y runner del participante (teclado, táctil, errores, reintentos, bloqueos) | Pruebas de componente con servidor falso + recorrido real en Chromium (escritorio y celular emulado) |
| Esquema, RLS y `claim_session` | Pruebas SQL contra Postgres 16 local (`scripts/verify-sql.sh`) |
| SEO: reglas, robots, sitemaps, PageSpeed, puntuación, rastreador (sitio simulado), protección SSRF, prompt | Pruebas unitarias |
| Visual: métricas de imagen (sharp), formatos, AOI y mapa de atención, franjas para IA, modelo journey/IFD, configuración, visor (componente) | Pruebas unitarias y de componente |
| Tablas SEO/Visual, RLS y políticas del bucket | Pruebas SQL (`supabase/tests/tools.sql`) |
| Rastreo contra sitios reales, subida a Storage, visión con Anthropic/OpenAI, PageSpeed real | **Tipado y compilado, sin ejecutar contra servicios reales** (requieren credenciales y red abierta) |
| Rutas `/api/s/*`, páginas del investigador, auth (email/Google), seed, llamadas reales a Anthropic/OpenAI | **Tipadas y compiladas, pero aún no ejecutadas contra Supabase real ni con API keys** (requieren credenciales). Primero correr `npm run test:e2e` con un usuario de prueba. |

## Referencia metodológica
Greenwald, A. G., Nosek, B. A., & Banaji, M. R. (2003). Understanding and using the Implicit Association Test: I. An improved scoring algorithm. *Journal of Personality and Social Psychology, 85*(2), 197–216.

## Notas de Next.js
Esta versión de Next (16) usa `proxy.ts` en lugar de `middleware.ts`, y `params`/`searchParams`/`cookies()` son asíncronos. Cache Components está desactivado a propósito (la app es dinámica).
