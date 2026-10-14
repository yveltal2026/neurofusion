# Diseño técnico: compositor de sesión (baterías)

Fecha: 2026-10-14 · Estado: **aprobado en lo esencial** (opción A y orden configurable, ver «Decisiones»); la implementación avanza por fases (§4). Continúa la ficha 1 de [`ROADMAP_MODULOS.md`](ROADMAP_MODULOS.md).

## Decisiones tomadas

1. **El compositor convive con el estudio de una sola herramienta** y el usuario elige entre ambos.
2. **La batería orquesta estudios existentes** (opción A, §2); no se reescribe el modelo del IAT.
3. **El orden de los pasos lo configura el usuario.** La plataforma **sugiere** un orden predefinido, pero el investigador puede **intercambiar** pasos y **omitir** los que no necesite según el objetivo del estudio. La omisión es una decisión del investigador al diseñar la batería; **no** se ofrece al participante saltarse pasos (eso cambiaría la muestra de cada medida). Detalle en §3.4.

## 1. Lo que hay hoy (verificado en el código)

| Pieza | Acoplamiento al IAT |
|---|---|
| `loadStudyByToken` (`src/lib/participant-api.ts`) | Filtra `tool_type = 'iat'` y valida con `iatConfigSchema` |
| `/api/s/[token]/{check,start,trials,complete}` | `start` arma el contrabalanceo; `trials` y `complete` puntúan el D-score |
| `claim_session` (SQL) | Bloquea el estudio, aplica candado por dispositivo, límite de respuestas y marca de IP. **Sus parámetros tienen forma de IAT, pero aceptan valores neutros** (`p_explicit = null`, `p_counterbalance = '[]'`), así que sirve tal cual para una encuesta |
| `sessions`, `trials`, `session_results` | Esquema del IAT. `unique(study_id, participant_ref)` |
| `Runner.tsx` (IAT) | Máquina de estados autocontenida: consentimiento → formulario → instrucciones → bloques → guardado → gracias. No se puede incrustar tal cual |
| `studies.tool_type` | `check (... in ('iat','seo','visual'))`; hay que ampliar para `survey` |
| Candado | Cookie de dispositivo por estudio (`deviceCookieName(study.id)`, ruta `/api/s`) |
| `claim_session` y reintentos | Un intento incompleto del mismo dispositivo se marca `abandoned` y **se reinicia** (a propósito, para no mezclar tiempos de reacción parciales) |

## 2. Opciones

**A. La batería orquesta estudios existentes (recomendada).** Una batería es una lista ordenada de estudios «hijo» (IAT, encuesta, y después eye tracking), cada uno con su propia configuración, su token y sus tablas. La batería sólo añade: su propia liga, un consentimiento y una sesión de participante que enlaza las sesiones de los hijos.
- A favor: **no toca el IAT ni sus datos** (cumple «convive» por construcción); cada paso sigue siendo un estudio válido por separado; el módulo nuevo se vuelve un paso sin reescribir el compositor; cruzar resultados es un `join` por la sesión de batería.
- En contra: el `Runner` del IAT necesita un modo incrustado; hay límites y candados en dos niveles (batería e hijos).

**B. Modelo unificado de pasos** (`studies` → pasos con estado por sesión y paso). Más elegante en el papel, pero obliga a reescribir `sessions`, `claim_session`, el runner y las vistas del IAT, con riesgo sobre lo que hoy funciona y está probado. **Descartada** mientras el IAT sea el único módulo maduro.

## 3. Diseño de la opción A

### 3.1 Esquema (borrador, sin aplicar)

```sql
-- Amplía tool_type: 'survey' (y más adelante 'eyetracking', ...)
alter table public.studies drop constraint studies_tool_type_check;  -- el nombre real se confirma en la migración
alter table public.studies add constraint studies_tool_type_check
  check (tool_type in ('iat','seo','visual','survey'));

create table public.batteries (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 160),
  status           text not null default 'draft' check (status in ('draft','published','closed')),
  access_token     text not null unique,            -- liga mágica de la batería
  max_responses    integer check (max_responses is null or max_responses > 0),
  closes_at        timestamptz,
  duplicate_policy text not null default 'device_cookie'
                   check (duplicate_policy in ('device_cookie','device_cookie_and_ip','none')),
  -- Textos (consentimiento, gracias), política de orden, versión del consentimiento.
  config           jsonb not null default '{}'::jsonb,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.battery_steps (
  battery_id uuid not null references public.batteries (id) on delete cascade,
  position   smallint not null check (position >= 0),
  study_id   uuid not null references public.studies (id) on delete restrict,
  -- false = el investigador omite el paso sin quitarlo de la batería (se conserva su lugar y su configuración).
  enabled    boolean not null default true,
  primary key (battery_id, position),
  unique (battery_id, study_id)
);  -- sólo estudios participativos (iat, survey): se valida en la app y con un trigger

create table public.battery_sessions (
  id              uuid primary key default gen_random_uuid(),
  battery_id      uuid not null references public.batteries (id) on delete cascade,
  participant_ref text not null,
  status          text not null default 'started' check (status in ('started','completed','abandoned')),
  consent_version text,                              -- versión del consentimiento de la batería
  device_id       uuid, ip_hash text, user_agent text,
  device_type     text not null default 'unknown',
  quality         jsonb not null default '{}'::jsonb, -- calidad común (validez IAT, calibración de mirada, ...)
  excluded        boolean not null default false,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  unique (battery_id, participant_ref)
);

alter table public.sessions
  add column battery_session_id uuid references public.battery_sessions (id) on delete cascade;
-- cascade: borrar la sesión de batería (p. ej. por una solicitud de eliminación) borra las sesiones hijas.
```

RLS por organización como el resto (a través de `projects.org_id`), y un `claim_battery_session` análogo a `claim_session` (bloqueo, límite y candado atómicos), sólo para `service_role`.

El estudio **encuesta** añade `survey_answers(session_id pk → sessions, study_id, answers jsonb, scores jsonb, engine_version, created_at)`, con las mismas políticas de RLS.

### 3.2 API del participante

| Ruta | Qué hace |
|---|---|
| `GET /api/b/[token]` (página `/b/[token]`) | Carga la batería publicada, sus pasos y el consentimiento |
| `POST /api/b/[token]/start` | Valida consentimiento, aplica candado/límite (`claim_battery_session`), devuelve `batterySessionId` y los pasos con su tipo y token. Fija una cookie firmada con el id de sesión de batería (para poder reanudar) |
| `/api/s/[childToken]/start` (existente) | Acepta un `batterySessionId` **opcional**; el servidor verifica que esa sesión pertenezca a una batería que contiene ese estudio y guarda `sessions.battery_session_id`. Sin él, funciona exactamente como hoy |
| `GET /api/b/[token]/progress` | Estado de cada paso, **derivado** de las sesiones hijas (no de lo que diga el cliente) |
| `POST /api/b/[token]/complete` | Verifica en el servidor que todos los pasos están `completed` y cierra la sesión de batería (idempotente) |

`loadStudyByToken` se generaliza: devuelve `tool_type` y la configuración cruda, y cada ruta valida con el esquema de su herramienta. El comportamiento para el IAT no cambia (sus pruebas siguen siendo la red de seguridad).

### 3.3 Runner incrustado

- El `Runner` del IAT gana un modo `embedded`: omite bienvenida/consentimiento y pantalla final, y llama a `onComplete()`. El consentimiento de la batería cubre al paso (se envía `consent: true` con la versión de la batería).
- Nuevo `BatteryRunner`: consentimiento → paso 1 → paso 2 → … → gracias. Progreso global, y si el participante recarga la página, consulta `progress` y retoma en el primer paso incompleto.
- Un paso IAT interrumpido **se reinicia** (misma regla que hoy); los pasos ya completados se conservan.

### 3.4 Orden de los pasos: sugerido por la plataforma, decidido por el investigador

- **Orden sugerido.** Al armar la batería, la plataforma ordena los pasos por familia de medida: **exposición** (eye tracking, pruebas de estímulos) → **implícita** (IAT) → **explícita** (encuestas). Es un punto de partida, no una regla. El orden vive en código puro y probado (`suggestOrder`).
- **Libertad del investigador.** Puede arrastrar para **intercambiar** pasos, **omitir** (`enabled = false`) los que no necesite, y volver al orden sugerido con un botón. Lo que corre el participante es: los pasos activos, en el orden guardado.
- **Avisos, no bloqueos.** Si el orden elegido tiene un riesgo metodológico conocido, la interfaz lo advierte sin impedirlo; p. ej. una medida explícita antes del IAT sobre el mismo concepto puede influir en las asociaciones implícitas. Los avisos son reglas puras con texto claro y se pueden descartar.
- **Registro.** La sesión de batería guarda el orden efectivamente corrido (`config.runOrder` en `battery_sessions`), de modo que el análisis sabe en qué orden vio cada participante los pasos aunque el investigador cambie la batería después. Cambiar el orden o los pasos activos de una batería **con respuestas** exige duplicarla (mismo criterio de «versión inmutable» que ya usan SEO y Visual), para no mezclar muestras que corrieron en órdenes distintos sin que quede claro.
- **Fuera de alcance por ahora.** Orden aleatorio entre participantes y contrabalanceo de orden (útiles para estudiar efectos de orden) y que el participante se salte pasos. El esquema no lo impide; se añade cuando una pregunta de investigación lo pida.

### 3.5 Informe integrado

Motor puro `src/tools/battery/engine`, con pruebas: une por `battery_session_id` el D-score del IAT, las puntuaciones de instrumentos (SUS, NPS, ...) y, más adelante, las métricas de mirada. Entrega agregados y correlaciones **con tamaño de muestra, IC y etiqueta de evidencia** (medido / estimado / modelado), con la supresión de grupos de menos de 5. La IA redacta sólo sobre esos agregados.

### 3.6 Calidad de sesión

`battery_sessions.quality` es un objeto común (p. ej. `{ iat: { validFraction }, gaze: { calibrationErrorDeg } }`). Cada módulo escribe su parte al cerrar su paso; el informe lo usa para ponderar o excluir.

### 3.7 Convivencia en la interfaz

«Nuevo estudio» ofrece **Una herramienta** (flujo actual, sin cambios) o **Batería**. En la batería se eligen estudios del proyecto (o se crea uno nuevo desde ahí) y se ordenan. Los estudios hijo de una batería se listan bajo ella; su liga individual sigue funcionando, pero sus sesiones quedan sin `battery_session_id` y el informe integrado las ignora.

## 4. Plan de implementación (cada fase se puede revisar y fusionar sola)

| Fase | Contenido | Criterio de salida |
|---|---|---|
| **F0** | Generalizar `loadStudyByToken` y la API del participante por `tool_type`, sin cambiar el comportamiento del IAT | Las 300 pruebas existentes siguen pasando; prueba nueva de que un token de IAT sigue respondiendo igual |
| **F1** | Herramienta **Encuesta**: migración (`survey` y `survey_answers`), API del participante, runner, wizard sencillo, resultados y CSV, análisis con IA sobre agregados | Una encuesta SUS+NPS se crea, se contesta en escritorio y celular y se exporta; el servidor puntúa y valida; RLS probado en SQL |
| **F2** | **Batería**: migración, API `/api/b/*`, modo incrustado del IAT, `BatteryRunner`, creación y vista de resultados por participante | Batería IAT + encuesta completa de punta a punta; recarga a mitad retoma bien; el estudio de una herramienta sigue idéntico |
| **F3** | **Informe integrado** (motor + vista) | Dos capas cruzadas con etiqueta de evidencia y supresión de grupos chicos |

**Estado (2026-10-14).** F0–F2 hechas y migración aplicada en Supabase. F3 hecha en lo esencial: motor `src/tools/battery/report` (D-score del IAT + métricas de encuesta por participante; Spearman con IC, p y ajuste de Holm; mínimo 10 pares y marca «exploratoria» bajo 30; etiquetas medido/estimado), página `/batteries/[id]/report`, CSV `/api/batteries/[id]/export`, exclusión manual de participantes y páginas de error amables en `/s` y `/b`. **Pendiente de F3:** desglose por grupo con supresión < 5 (la batería aún no captura segmentos), análisis con IA sobre los agregados, y ponderar por `quality`.

## 5. Riesgos y decisiones abiertas

1. **Dos niveles de límite y candado** (batería e hijos). Mitigación: los estudios hijo creados desde una batería no llevan límite propio; el de la batería manda y se aplica con `claim_battery_session`.
2. **Tokens de los hijos** viajan al navegador del participante. Son ligas ya «públicas» por diseño; no abren nada que la liga individual no abra.
3. **Refresco a mitad de un IAT** reinicia ese paso; en baterías largas puede aumentar el abandono. A medir en las pruebas con escuelas.
4. **Una sola `Runner` del IAT con dos modos** puede volverse frágil. Mitigación: extraer la parte de bloques a un componente reutilizable antes de añadir el modo incrustado, con las pruebas del runner como red.
5. **Legal (postergado, no olvidado).** El diseño ya deja los ganchos: el consentimiento vive en la **batería** y se versiona en `battery_sessions.consent_version`; el código de participación para ARCO puede ser `participant_ref`; borrar una sesión de batería borra las hijas; `quality` y `ip_hash` están acotados. Cuando se retome el tema legal ([`ANALISIS_LEGAL_EYETRACKING.md`](ANALISIS_LEGAL_EYETRACKING.md)), no debería requerir rediseño.
6. **Orden configurable:** más libertad implica más combinaciones que probar (pasos omitidos, orden distinto por batería). Mitigación: el runner trabaja sólo con «lista de pasos activos en orden», así que la lógica del participante no cambia; la complejidad queda en el editor y en las reglas de aviso.
7. **Sin decisiones abiertas de arquitectura.** Quedan los detalles de cada fase, que se revisan al implementarlas.
