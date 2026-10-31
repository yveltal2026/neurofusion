# CognIA

Nombre oficial de la aplicación, anteriormente NeuroFusion. El repositorio y algunos identificadores técnicos conservan el nombre anterior.

Los cambios y mejoras se registran en el [backlog de CognIA](docs/backlog/README.md), con una [matriz de adopción por universidad](docs/backlog/ADOPCION.md) e instrucciones para replicarlos entre repositorios. Cada entrega debe incluir su ficha y actualizar su estado real de integración y validación.

Plataforma para diseñar, aplicar y analizar estudios de neuromarketing. Hoy es de uso educativo/demostrativo; la arquitectura (organizaciones, RLS, herramientas registrables) está pensada para convertirse en un SaaS. Herramientas disponibles:

| Herramienta | Para qué |
|---|---|
| **IAT** (Test de Asociación Implícita) | Asociaciones implícitas con participantes reales vía liga mágica |
| **Auditoría SEO** | Rastreo, on-page, datos estructurados, enlaces y Core Web Vitals; plan de acción redactado por IA |
| **Análisis visual con IA** | Piezas gráficas y capturas web (mapa de atención estimado, recorrido, zonas ciegas, métricas de imagen) y modo journey con rúbrica e Índice de Fricción Digital (IFD) |
| **Eye tracking con webcam** | Mirada de participantes sobre imágenes, calibración, controles de deriva y mapas de atención medidos |
| **Encuesta** | Preguntas propias e instrumentos estandarizados (SUS, NPS, SAM, intención de compra, actitud) con liga mágica; el servidor valida y puntúa; resultados con intervalos de confianza y CSV |
| **Variantes del IAT** | SC-IAT, Go/No-Go y priming evaluativo con participantes y validación en el servidor |

SEO y Visual provienen del módulo NeuroSEO; decisiones, modelo y pendientes en [`docs/HERRAMIENTAS_SEO_VISUAL.md`](docs/HERRAMIENTAS_SEO_VISUAL.md). Lo que sigue en «Qué hace» describe el flujo del IAT.

## Qué hace

1. El investigador crea un **proyecto** (un proyecto podrá agrupar varias herramientas).
2. Crea un **estudio IAT** con un wizard de 7 pasos (producto, conceptos, dimensiones, palabras, rigor, datos del participante, identidad visual) que reproduce el interrogatorio de la skill `iat-study-builder`. Antes del paso 1 eliges entre **capturar todo manualmente** o **diseño asistido por IA**: describes en pocas líneas qué quieres analizar y su contexto, y la IA propone categoría, dimensiones (pares de polos) y 5 palabras por polo con el criterio de la skill; todo queda editable. Las preguntas adicionales al participante pueden ser texto, número, opción única, **opción múltiple** (tú defines las opciones) o **escala Likert** (3–10 puntos con etiquetas en los extremos); en el CSV las opciones múltiples salen como columnas 0/1 por opción.
3. Se genera una **liga mágica** que comparte con N participantes. Puede cerrarse, limitarse por número de respuestas o fecha, regenerarse o probarse en **vista previa** (no guarda datos).
4. Los participantes: consentimiento → los datos que el investigador pidió → test (teclado **o** botones táctiles en celular) → agradecimiento. **No ven resultados.**
5. Los datos se almacenan centralmente. El investigador consulta **datos crudos** (tabla, detalle por sesión, exclusiones, CSV) o pide un **análisis** con estadísticos, gráficas y conclusiones redactadas por IA.

### Cuestionarios con imágenes

En **Encuesta → Preguntas**, cada pregunta propia permite **Agregar imagen**, previsualizarla, cambiarla o quitarla y añadir una descripción accesible opcional. Funciona con opción única (por ejemplo «¿Comprarías este producto?» con Sí/No), opción múltiple, Likert, texto libre, número y recomendación 0–10. Se admite una imagen PNG, JPEG o WebP de hasta 10 MB por pregunta. Cambiar el tipo o duplicar la pregunta conserva su imagen.

Los archivos permanecen locales hasta **Crear encuesta y generar liga**. Se suben al bucket privado `study-assets` y el servidor verifica contenido, tamaño y pertenencia al estudio antes de publicar. El participante ve la imagen completa al responder desde computadora o celular, también en las baterías. Duplicar un estudio copia sus archivos; eliminarlo limpia sus imágenes. No requiere nuevas migraciones ni variables, pero sí las migraciones de Storage ya existentes. Estado y validación: [COG-20261030-imagenes-cuestionario](docs/backlog/cambios/COG-20261030-imagenes-cuestionario.md).

### Imágenes con IA: lote y desglose por elemento

El resumen de piezas permite seleccionar imágenes individuales, todas o sólo las pendientes y **Analizar seleccionadas** con progreso, errores por pieza y reintento de fallidas. Los journeys ofrecen el mismo control en **Analizar capturas en lote**. Cada resultado se guarda por separado y el lote se puede detener después de la solicitud activa.

El detalle de cada imagen y su informe muestran **Aciertos principales**, **Debilidades principales** con recomendaciones y **KPIs estimados por AOI** (TTFF, FC, FD, TFD, dwell, hit rate, primera fijación, visitas y regresos), exportables a CSV. Son **predicciones numéricas de IA no medidas ni validadas**, bajo un escenario hipotético común de 5 segundos; la advertencia y el escenario se conservan en la exportación. Los análisis anteriores siguen disponibles y requieren un nuevo análisis para obtener predicciones; las AOI modificadas no heredan números de otras regiones. No se mezclan con mediciones de webcam. Método y límites en [`docs/ANALISIS_VISUAL_LOTES.md`](docs/ANALISIS_VISUAL_LOTES.md).

### Estudios de eye tracking con webcam

Los controles de `eye-v3` calculan detección y frecuencia sólo durante la fijación, excluyendo el tiempo para mover los ojos al siguiente objetivo. Un punto sin suficientes lecturas se recaptura una sola vez durante 1.5 s adicionales. La recuperación muestra la causa y sus métricas. Tras dos ajustes fallidos se ofrece terminar con **precisión limitada**: la participación se guarda con `measurementStatus=limited` y `passed=false`, y queda fuera de los mapas de atención válidos. Los criterios angulares permanecen iguales. Para investigar un fallo real, abre la liga con `?diagnostic=1` (o `&diagnostic=1` si ya tiene parámetros); la pausa permite descargar un JSON local sin token de acceso ni video.

Los estudios de webcam se ejecutan mediante su liga propia. Las baterías admiten la exposición de imágenes de IA; no sustituyen el protocolo de webcam. La migración `20261027010000_battery_eyetracking_guard.sql` mantiene esa separación al incorporar ambas funciones.

Creación dedicada: `/projects/[id]/studies/new/eyetracking`. Tiene formulario, resumen, imágenes y resultados propios; los estudios de IA no ofrecen opciones de webcam. Los estudios de webcam existentes se reconocen por su configuración y conservan sus enlaces y datos. Se reutiliza el almacenamiento de imágenes (`tool_type=visual` + `config.eyeTracking`); esta separación no requiere migración adicional.

1. En **Nuevo estudio**, elige **Eye tracking con webcam** (herramienta separada de **Análisis visual con IA**) y sube de 1 a 5 imágenes PNG, JPEG o WebP. Configura de 5 a 30 segundos por imagen (10 por defecto). Tras la primera sesión, las piezas quedan fijadas para que las respuestas sean comparables.
2. Comparte la liga mágica desde el resumen del estudio. La vista previa ejecuta el recorrido sin guardar datos. Los participantes aceptan el uso de cámara, calibran por defecto en dos etapas de 9 puntos, validan en otros 8 objetivos y miran las piezas. La cámara requiere HTTPS o localhost.
3. El video se procesa en el dispositivo. El servidor guarda coordenadas normalizadas dentro de cada imagen, tiempos y calidad de calibración en `eye_tracking_runs`; no recibe ni guarda video. El investigador ve mapas agregados de sesiones con calibración aceptable, puede excluir sesiones y descargar las lecturas en CSV desde **Miradas**.
4. El motor WebEyeTrack descarga recursos de `cdn.jsdelivr.net` y `storage.googleapis.com`; ambos dominios deben estar disponibles en los dispositivos participantes. Aplica también `20261027000000_visual_eyetracking.sql` antes de usar el flujo. La precisión y compatibilidad con Safari/iOS deben medirse en dispositivos reales siguiendo [`docs/EYETRACKING-SPIKE.md`](docs/EYETRACKING-SPIKE.md); el simulador `?engine=fake` comprueba la interfaz, no la precisión.

La configuración pide la diagonal física en pulgadas y el formato del monitor (incluye ultrawide 21:9 y 32:9); calcula el ancho para estimar el error angular. La calibración recomendada `v5-weighted-refinement` pondera las fijaciones por calidad, detecta saturación, acerca el punto afectado al centro y revisa como máximo dos fijaciones débiles. Usa un ajuste afín inicial y una segunda ronda de nueve puntos interiores para corregir escala y desplazamiento por eje. La validación final usa objetivos distintos y no interviene en el entrenamiento. Mantén la mirada sobre cada punto hasta que cambie.

Los estudios comprueban la deriva con tres objetivos antes de empezar, cada dos piezas y al terminar. Un control fallido pausa la presentación y permite recolocarse con un control breve de tres puntos; la recalibración completa queda disponible si el ajuste no basta. Se conservan las imágenes de los bloques que ya pasaron su control posterior y se repite sólo el bloque pendiente de validar (máximo dos imágenes), también después de recalibrar o cambiar de pestaña. El avance reside en memoria mientras la sesión siga abierta. Las lecturas descartadas no se envían como válidas; `validation.recovery` registra controles de recuperación, pausas, recalibraciones e imágenes repetidas, visibles en Miradas y en el CSV. Si hubo varias calibraciones, la calidad enviada conserva el peor error y la menor cobertura/frecuencia de sus validaciones. El laboratorio permite ejecutar el mismo control con «Comprobar deriva» y exporta sus resultados en JSON. Las sesiones nuevas usan `eye-v3` (manteniendo compatibilidad con `eye-v1` y `eye-v2`): el servidor exige los controles previstos y recalcula su aceptación; los resúmenes se guardan dentro de `eye_tracking_runs.validation`, sin migración adicional. La tabla de Miradas muestra la deriva máxima. La precisión de v5 debe confirmarse con nuevas sesiones reales.

## Principios de diseño

- **Matemática determinista y testeada.** Bloques, contrabalanceo, D-score, validez y estadísticos viven en `src/tools/iat/engine` (código puro, sin I/O). La IA **sólo redacta** sobre agregados ya calculados y **nunca recibe filas crudas ni datos personales**.
- **El servidor no confía en el cliente.** El servidor decide el contrabalanceo y una semilla por dimensión; con ellas regenera exactamente el plan de ensayos, valida lo que envía el cliente (sólo tiempos y teclas) y recalcula el D-score.
- **Privacidad por defecto.** No se pide correo ni nombre al participante; la IP sólo se guarda como HMAC por estudio; los CSV no incluyen identificadores de dispositivo.

Detalles metodológicos en [`docs/METODOLOGIA.md`](docs/METODOLOGIA.md) (IAT) y [`docs/HERRAMIENTAS_SEO_VISUAL.md`](docs/HERRAMIENTAS_SEO_VISUAL.md) (SEO y Visual).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, RLS) · Zod · Recharts · Vitest · Playwright. IA: cascada Gemini gratuito → Gemini de paga → Claude (también OpenAI opcional).

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Aplica las migraciones de `supabase/migrations` en orden (`supabase db push`, o pegando el SQL en el editor). La migración `20261013000000_seo_visual_tools.sql` crea el bucket privado de Storage `study-assets`; `20261027000000_visual_eyetracking.sql` agrega las mediciones de mirada y sus políticas.
3. En *Authentication → Providers* habilita **Email** y, si lo quieres, **Google** (necesitas credenciales OAuth de Google Cloud). Añade `http://localhost:3000/auth/callback` (y la URL de producción) a las *Redirect URLs*. Ese mismo callback sirve para confirmar el correo, Google y el **restablecimiento de contraseña** (`/forgot-password` → correo → `/reset-password`); la plantilla *Reset Password* de *Authentication → Email Templates* debe conservar `{{ .ConfirmationURL }}`.
4. Copia URL, `anon key` y `service_role key` (*Project Settings → API*).

#### Correo (SMTP propio): obligatorio para producción
El correo integrado de Supabase es sólo para pruebas: tiene un tope muy bajo por hora y **sólo entrega a direcciones de los miembros del equipo** de la organización de Supabase. Con él, crear cuentas, confirmar el correo y restablecer la contraseña fallan con `email rate limit exceeded` o `Email address not authorized`. Configura un SMTP propio en *Authentication → Emails → SMTP Settings* (Resend, SendGrid, Amazon SES, etc.) con un remitente de tu dominio (p. ej. `noreply@frsko.com`) y publica en el DNS los registros SPF/DKIM que indique el proveedor. Con SMTP propio el tope por defecto es de 30 usuarios nuevos por hora y se ajusta en *Authentication → Rate Limits*. Mientras tanto, «Continuar con Google» no envía correos.

#### Iniciar sesión con Google
El botón «Continuar con Google» ya está en `/login` y `/signup`; sólo falta configurarlo (el código no cambia):
1. En [Google Cloud Console](https://console.cloud.google.com) → *APIs & Services → OAuth consent screen*: tipo **External**, nombre «NeuroFusion», correo de soporte y de contacto. Con sólo los permisos básicos (correo y perfil) no pide verificación; pasa la pantalla de *Testing* a **In production**, o sólo podrán entrar los usuarios de prueba que listes.
2. *Credentials → Create credentials → OAuth client ID → Web application*. En **Authorized redirect URIs** pon la URI de callback de Supabase: `https://<ref-del-proyecto>.supabase.co/auth/v1/callback` (la muestra Supabase en *Authentication → Providers → Google*).
3. Copia el *Client ID* y el *Client secret* a Supabase (*Authentication → Providers → Google*), activa el proveedor y guarda. El secreto va sólo ahí: nunca en el repo ni en variables de Vercel.
4. En *Authentication → URL Configuration*: **Site URL** = la URL de producción y, en *Redirect URLs*, `https://<tu-dominio>/**` y `http://localhost:3000/**`. El callback lleva `?next=` y la lista debe aceptarlo; si Google devuelve a la portada en lugar de `/projects`, falta este paso.


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
| `GEMINI_API_KEY_FREE` | Key de Gemini de un proyecto de Google **sin facturación** (nivel gratuito). Alias: `GEMINI_API_KEY` |
| `GEMINI_API_KEY_PAID` | Key de Gemini de un proyecto de Google **con facturación** |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Claude: Haiku, Sonnet y, como último nivel, el modelo de `ANTHROPIC_MODEL` (por defecto `claude-opus-5-5`) |
| `AI_CASCADE` | Opcional: orden y modelos de la cascada (ver abajo) |
| `GEMINI_THINKING_LEVEL` | Opcional: razonamiento de Gemini (`minimal`, `low`, `medium`, `high` u `off`); por defecto `low`. Evita que los Flash superen el tope de 45 s por nivel |
| `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL` | Modo anterior de un solo proveedor; solo aplica si no hay claves de Gemini ni `AI_CASCADE`. OpenAI exige modelo explícito |
| `PAGESPEED_API_KEY` | Opcional. Clave de PageSpeed Insights (Google Cloud) para Core Web Vitals en la auditoría SEO; sin ella la cuota es muy baja |

#### Cascada de proveedores de IA
Toda función con IA (análisis IAT, auditoría SEO, herramienta visual, asistente del wizard) pasa por una cascada que prueba los niveles **en orden** y usa la primera respuesta:

1. Gemini gratuito, el más potente → 2. Gemini gratuito, menos potente → 3. Claude Haiku (el de paga más barato) → 4. Gemini de paga, barato pero potente → 5. Claude Sonnet → 6. Gemini de paga, más caro (Argon) → 7. Claude, último recurso (Opus por defecto; se fija con `ANTHROPIC_MODEL`).

Pasa al siguiente nivel si el actual agota su cuota, la key es inválida, el proveedor falla, tarda demasiado (45 s por nivel; 110 s en total, y los niveles intermedios se omiten si ya no queda tiempo para el último), corta la respuesta o rechaza el contenido. Un nivel sin cuota, con key inválida o que agotó su tope de tiempo se salta unos minutos para no gastar tiempo en cada petición. Los niveles sin API key se omiten, así que basta con configurar los que quieras usar. El análisis guarda qué proveedor y modelo respondieron (`provider`, `model`). Orden por defecto (cámbialo con `AI_CASCADE`, sin tocar código):

```
AI_CASCADE=gemini-free:gemini-3.8-flash,gemini-free:gemini-3.5-flash-lite,anthropic:claude-haiku-5-5,gemini-paid:gemini-3.8-flash,anthropic:claude-sonnet-5-5,gemini-paid:gemini-4-argon,anthropic
```

- **Gratuito vs. de paga** lo define la key, no el modelo: la gratuita es de un proyecto de Google sin facturación y la de paga de uno con facturación. Los nombres de modelo de Gemini cambian y qué modelos admite el nivel gratuito también (a oct-2026: Gemini 2.5 ya no se entrega a proyectos nuevos y los modelos Pro no están en el nivel gratuito). Confírmalo en Google AI Studio o con `models.list` y ajusta `AI_CASCADE`. `gemini-4-argon` es el más caro: su precio de introducción se duplica el 1 de diciembre de 2026.
- **Privacidad:** los términos del nivel gratuito de Gemini permiten a Google usar lo que se envía para mejorar sus productos. El análisis IAT envía solo agregados (nunca filas ni datos personales), pero la herramienta visual envía imágenes y la SEO contenido de páginas. Si eso es un problema, deja sin `GEMINI_API_KEY_FREE` o quita los niveles `gemini-free` de `AI_CASCADE`.
- Si todos los niveles fallan, el investigador ve el error del último nivel y cuántos proveedores se intentaron. Los detalles por nivel quedan en los logs del servidor (`[ai] …`).

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
| Eye tracking en estudios visuales: esquema, métricas, coordenadas, mapa, RLS | Pruebas unitarias y SQL; recorrido completo del laboratorio simulado en Chromium |
| Eye tracking con cámara real, precisión y Safari/iOS | Pendiente de prueba con personas y dispositivos reales; ver `docs/EYETRACKING-SPIKE.md` |
| Rastreo contra sitios reales, subida a Storage, visión con Anthropic/OpenAI, PageSpeed real | **Tipado y compilado, sin ejecutar contra servicios reales** (requieren credenciales y red abierta) |
| Encuesta: motor (instrumentos, validación, puntuación, agregados, alfa de Cronbach), lógica de servidor del participante, runner, constructor, resultados y CSV | Pruebas unitarias y de componente (cliente de Supabase falso en memoria) |
| Encuesta: tabla `survey_answers`, RLS, `claim_session` con encuestas | Pruebas SQL (`supabase/tests/survey.sql`) |
| Baterías con IAT, variantes, encuesta e imagen con IA: orden y avisos, runner incrustado, paso de exposición, informe integrado y CSV | Pruebas unitarias y de componente (clientes de Supabase falsos) |
| Baterías: guarda de pasos (variantes y piezas visuales), `start_battery_exposure` / `complete_battery_exposure`, orden y privilegios | Pruebas SQL (`supabase/tests/battery_tools.sql`) |
| Rutas `/api/s/*`, páginas del investigador, auth (email/Google; el restablecimiento de contraseña sólo se probó contra un Supabase Auth simulado, sin correo real), seed, llamadas reales a Anthropic/OpenAI | **Tipadas y compiladas, pero aún no ejecutadas contra Supabase real ni con API keys** (requieren credenciales). Primero correr `npm run test:e2e` con un usuario de prueba. |

## Referencia metodológica
Greenwald, A. G., Nosek, B. A., & Banaji, M. R. (2003). Understanding and using the Implicit Association Test: I. An improved scoring algorithm. *Journal of Personality and Social Psychology, 85*(2), 197–216.

## Notas de Next.js
Esta versión de Next (16) usa `proxy.ts` en lugar de `middleware.ts`, y `params`/`searchParams`/`cookies()` son asíncronos. Cache Components está desactivado a propósito (la app es dinámica).
