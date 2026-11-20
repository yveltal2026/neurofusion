# Feature Specification: Eyetracking para Web (Sitio en Vivo y Modo Sin Código)

**Feature Branch**: `002-web-eyetracking`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "Dejar un módulo especial de Eyetracking para web dentro de Proyectos en la categoría enfocada a web: el analista pone la URL a analizar, la serie de pasos e instrucciones que el usuario final va a hacer en la web (con código en el header estilo RealEye), y un escenario fallback sin código cuando el usuario no pueda poner código en el sitio (mediante capturas de la web con scroll y tareas)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurar estudio de Eyetracking Web con URL y pasos (Priority: P1)

El analista entra a un proyecto, selecciona **Eyetracking para Web** dentro de **Diagnóstico digital**, define la URL objetivo, el modo de ejecución (**Sitio en vivo con snippet** o **Sin código con capturas web**) y la secuencia ordenada de pasos/instrucciones que el participante deberá completar.

**Why this priority**: Es la base de configuración del estudio; sin URL, pasos y modo de captura no existe protocolo que ejecutar ni liga mágica que compartir.

**Independent Test**: Se puede probar creando un estudio `web_eyetracking`, configurando una URL válida, 2–3 pasos con instrucciones y verificando que se genera la liga mágica y (en modo en vivo) el snippet `<script>` listo para copiar.

**Acceptance Scenarios**:

1. **Given** un investigador en *Nuevo estudio*, **When** selecciona **Eyetracking para Web**, **Then** puede ingresar nombre, URL inicial, modo (`live_snippet` o `no_code_captures`), y una lista ordenada de pasos (título, instrucción y criterio de avance).
2. **Given** un estudio configurado en modo **Sitio en vivo**, **When** se guarda la configuración, **Then** el sistema muestra el snippet único para insertar en el `<head>` (o GTM) del sitio objetivo y permite verificar su instalación.

---

### User Story 2 - Participante completa tareas en Sitio en Vivo con snippet en `<head>` (Priority: P1)

El participante abre la liga mágica de Aesteros, acepta el consentimiento y es dirigido a la URL objetivo con su token de sesión. El snippet embebido en el sitio muestra la barra flotante con las instrucciones paso a paso, ejecuta la calibración y seguimiento ocular por webcam en el mismo origen del sitio y envía la telemetría (mirada, scroll, viewport, clics y avance de pasos) al servidor.

**Why this priority**: Es el flujo diferenciador principal estilo RealEye para medir comportamiento real en un sitio en producción o staging.

**Independent Test**: Se puede probar en una página de prueba con el snippet embebido, recorriendo consentimiento → redirección con `?nf_session=...` → calibración → envío de lotes de mirada y finalización de pasos.

**Acceptance Scenarios**:

1. **Given** un participante con liga mágica válida y cámara disponible, **When** llega al sitio objetivo con el snippet instalado, **Then** visualiza el widget flotante con el paso actual, realiza la calibración de mirada y registra muestras `(x, y, scrollY, viewport, stepId)`.
2. **Given** un participante que avanza por los pasos indicados, **When** completa el último paso, **Then** la sesión se marca como completada y el participante es redirigido a la pantalla de agradecimiento sin ver resultados.

---

### User Story 3 - Modo Sin Código (capturas web con scroll y zonas clicables) (Priority: P2)

Cuando el analista no puede instalar código en el sitio objetivo (p. ej. sitios de competencia o CMS restringido), sube capturas de pantalla *full-page* (o solicita captura de la URL) para cada paso, define opcionalmente zonas clicables (*hotspots*) para avanzar entre pantallas y los participantes ejecutan la prueba directamente dentro del runner de Aesteros con scroll vertical y webcam.

**Why this priority**: Garantiza que la herramienta sea 100 % utilizable sin acceso técnico al sitio destino, evitando bloqueos de `X-Frame-Options` o permisos cruzados de cámara.

**Independent Test**: Se puede probar creando un estudio en modo `no_code_captures`, subiendo 2 capturas largas, configurando un hotspot de avance y completando una sesión simulada de participante dentro de `/s/[token]`.

**Acceptance Scenarios**:

1. **Given** un estudio en modo `no_code_captures`, **When** el analista sube capturas web por paso y define zonas de avance, **Then** los participantes navegan el flujo dentro de Aesteros con scroll vertical y registro continuo de mirada ajustada al desplazamiento.

---

### User Story 4 - Analizar mapas de calor, ruta visual y métricas por paso (Priority: P2)

El analista consulta los resultados agregados del estudio: mapas de calor sobre la captura de referencia de cada paso/URL (compensando el desplazamiento `scrollY`), *gaze plot* secuencial, tasa de completitud por paso y tiempo hasta la primera fijación en áreas de interés (AOI).

**Why this priority**: Convierte la telemetría cruda de mirada y scroll en métricas accionables para el analista.

**Independent Test**: Se puede probar sembrando una sesión completada con muestras de mirada + scroll y verificando que el motor determinista calcula fijaciones, métricas por paso y renderiza el heatmap sobre la captura de referencia.

**Acceptance Scenarios**:

1. **Given** un estudio con sesiones completadas válidas, **When** el analista abre la pestaña de resultados, **Then** visualiza métricas deterministas por paso (completitud, tiempo, fijaciones) y mapa de calor superpuesto a la pantalla correspondiente.

---

### Edge Cases

- ¿Qué pasa si el sitio en modo `live_snippet` no tiene el script instalado o el dominio no coincide con la URL configurada? El servidor rechaza envíos de orígenes no autorizados y el panel del analista muestra estado de verificación del snippet.
- ¿Qué pasa si el participante niega permisos de cámara o abandona a mitad de los pasos? La sesión queda en estado `started`/`abandoned` sin contaminar métricas de completitud y respetando el candado de duplicados.
- ¿Qué pasa si distintos participantes tienen distintos tamaños de ventana (`viewport`)? Las coordenadas de mirada se normalizan respecto al documento/viewport y `scrollY` para poder agregarse de forma determinista sobre la captura de referencia.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El registro de herramientas MUST incorporar **Eyetracking para Web** (`web_eyetracking`) dentro de la categoría **Diagnóstico digital** en Proyectos, sin alterar los estudios existentes de `eyetracking` sobre imágenes/video.
- **FR-002**: El estudio MUST soportar una URL objetivo, una lista ordenada de pasos (título, instrucción, condición de avance) y dos modos: `live_snippet` (código en `<head>`) y `no_code_captures` (capturas con scroll y hotspots).
- **FR-003**: En modo `live_snippet`, el sistema MUST generar un script embebible ligero y endpoints `/api/s/[token]/web-eyetrack` con validación de origen/dominio y token de sesión, registrando mirada, scroll, viewport, clics y progreso de pasos.
- **FR-004**: En modo `no_code_captures`, el sistema MUST permitir asociar capturas web (con scroll vertical) a cada paso y avanzar mediante clic en hotspot configurado o botón de paso completado dentro del runner propio `/s/[token]`.
- **FR-005**: Un motor determinista MUST normalizar coordenadas `(x, y, scrollY, viewport)` al espacio de la captura de referencia, calcular métricas por paso y generar datos agregados de mapa de calor y fijaciones sin usar IA para inventar métricas.
- **FR-006**: La privacidad del participante MUST mantenerse por defecto (sin pedir correo/nombre, IP sólo como HMAC por estudio, control atómico de sesiones).

### Key Entities *(include if feature involves data)*

- **WebEyetrackingStudy (`studies` con `tool_type = 'web_eyetracking'`)**: Configuración de URL objetivo, dominios permitidos, modo (`live_snippet` | `no_code_captures`), pasos ordenados y parámetros de calibración.
- **WebEyetrackingStep**: Paso numerado con instrucción para el participante, URL esperada o captura asociada y criterio de avance (`manual` | `hotspot` | `url_match`).
- **WebEyetrackingRun**: Registro por sesión de participante con validación de calibración, eventos de pasos (inicio/fin/éxito) y muestras normalizadas de mirada + scroll.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un analista puede configurar un estudio de **Eyetracking para Web** (URL + 3 pasos) y obtener su liga mágica y snippet (o subir capturas sin código) en menos de 3 minutos.
- **SC-002**: El script embebido en modo `live_snippet` envía lotes de telemetría sin bloquear el hilo principal del sitio destino y soporta distintos viewports normalizando al documento.
- **SC-003**: El 100 % de la normalización de coordenadas, métricas por paso y generación de agregados de calor es determinista y está cubierto por pruebas unitarias en Vitest (`typecheck`, `lint`, `test` en verde).

## Assumptions

- Para `live_snippet`, la calibración y captura de webcam ocurren dentro del script en el dominio destino para evitar que las políticas de permisos del navegador bloqueen la cámara entre orígenes.
- Para `no_code_captures`, en V1 el analista sube las capturas web (y opcionalmente en una mejora posterior se puede añadir captura automática desde URL); esto evita dependencias de Chromium headless en runtime serverless.
- El diseño visual y métricas reutilizan la infraestructura de calibración y mapas de calor ya probada en `src/lab/eyetracking/` y `src/tools/visual/eye/`.
