# Facial Coding + Eye Tracking en Contenidos de Video

Fecha: 2026-11-12 · Actualizado: 2026-11-13 · Estado: **Ejecución nativa en plataforma (`idt-video-v1` + `fc-blendshape-v1`)**

## 1. Objetivo y alcance

Extender las capacidades de medición biométrica en navegador de la plataforma (hasta ahora centradas en eye tracking sobre imágenes fijas con `idt-image-v1`) hacia **estímulos de video** de forma **100% nativa dentro de la propia plataforma**, combinando:

1. **Eye Tracking en video (`idt-video-v1`)**: coordenadas normalizadas dentro del rectángulo real de reproducción (`VideoContentRect`), ancladas al reloj del medio (`video.currentTime`), con soporte de escenas temporales y Áreas de Interés (AOIs) estáticas por intervalo o dinámicas por *keyframes* interpolados.
2. **Facial Coding (`fc-blendshape-v1`)**: extracción en navegador con `@mediapipe/tasks-vision` (`FaceLandmarker` con `outputFaceBlendshapes: true`) de los **52 coeficientes ARKit**, normalizados contra la línea base neutra de cada participante, proyectados a **12 Action Units (FACS)**, parpadeo (`AU45`) y **4 índices compuestos** (*Valencia*, *Sonrisa/Afinidad*, *Fruncido/Esfuerzo*, *Sorpresa*, además de *Expresividad*).
3. **Atribución Afectiva Condicionada a la Mirada (*Gaze-Locked Affect*)**: cruce espacio-temporal que determina no sólo si el participante miró una AOI (p. ej. producto, precio, logo o vocero), sino qué reacción facial tuvo mientras la miraba (incluyendo una ventana fisiológica de latencia de $+300\text{ ms}$).
4. **Flujo completo integrado en la plataforma**: configuración unificada en la creación/resumen del estudio de Eye Tracking (`Imágenes` vs. `Video`), corredor de participante (`/s/[token]`) con calibración de 9 puntos, validación de 8 puntos, controles de deriva `[0, 1]`, persistencia nativa en `eye_tracking_runs`, visor analítico en `/studies/[id]/eye` y exportación CSV en `/api/studies/[id]/eye/export`.

---

## 2. Arquitectura nativa en la plataforma

1. **Participante (`/s/[token]`)**:
   - [`EyeStudyRunner`](../src/tools/visual/eye/EyeStudyRunner.tsx) detecta si el estudio usa imágenes o video.
   - En estudios de video, [`VideoStudyRunner`](../src/tools/visual/video/VideoStudyRunner.tsx) ejecuta calibración (9 puntos), validación (8 puntos), control inicial de deriva (`afterAssetCount: 0`), [`VideoNeuroRunner`](../src/tools/visual/video/VideoNeuroRunner.tsx) (precarga en `Blob` + 3 s de línea base neutra cuando Facial Coding está activo + muestreo sincronizado a `video.currentTime`) y control final de deriva (`afterAssetCount: 1`).
   - El paquete [`src/lab/eyetracking/*`](../src/lab/eyetracking/EyeTrackingLab.tsx) (`COG-20261028-eyetracking-movil`) permanece intacto para estudios de imágenes fijas.
2. **Persistencia (`POST /api/s/[token]/eye/complete`)**:
   - Valida [`videoNeuroRunSchema`](../src/tools/visual/video/schema.ts) y el protocolo `eye-v3` (`completionAllowed` / `requiredDriftChecksPass` con `driftCheckpoints(1) = [0, 1]`), guardando la observación multimodal directamente en `eye_tracking_runs.observations` (sin migraciones SQL adicionales).
3. **Analítica y exportación (`/studies/[id]/eye` y `/api/studies/[id]/eye/export`)**:
   - [`aggregateVideoStudy`](../src/tools/visual/video/metrics.ts) agrega las sesiones válidas y alimenta [`VideoAttentionAffectViewer`](../src/tools/visual/video/VideoAttentionAffectViewer.tsx) (visor dividido, AOIs dinámicas, línea de tiempo afectiva, 12 FACS AUs y pantalla completa).
   - El exportador CSV incluye tanto muestras de mirada (`gaze`) como lecturas faciales (`facial` con `au01`..`au26` y `blink`).

---

## 3. Método `fc-blendshape-v1` (Facial Coding)

### 3.1 Calibración de línea base individual (*Baseline Subtraction*)
Cada participante presenta rasgos morfológicos basales distintos en reposo. Durante los $3\text{ segundos}$ previos al inicio del video (pantalla de fijación central neutra), se recolectan los vectores de 52 blendshapes con pose válida y se calcula la mediana por canal $\beta_k$:

$$\Delta b_k(t) = \operatorname{clamp}_{[0, 1]}\left(\frac{b_k(t) - \beta_k}{1 - \min(0.7, \beta_k)}\right)$$

### 3.2 Compuerta de pose de cabeza (*Head-Pose Gate*)
A partir de la matriz de rotación $R_{3\times 3}$ contenida en `facialTransformationMatrixes`, se extraen los ángulos de Euler (`yaw`, `pitch`, `roll` en grados). Si $|\text{yaw}| > 35^\circ$ o $|\text{pitch}| > 25^\circ$, la lectura se marca con `poseValid: false` y sus Action Units no entran en los promedios afectivos del segmento, evitando falsos positivos cuando el participante gira la cabeza o mira fuera de la pantalla.

### 3.3 Mapeo a Action Units (FACS) e índices compuestos

| Código | Nombre FACS | Blendshapes origen ($\Delta b_k$) | Escala exportada |
| :--- | :--- | :--- | :--- |
| `au01` | *Inner Brow Raiser* | `browInnerUp` | `0..100` |
| `au02` | *Outer Brow Raiser* | `mean(browOuterUpLeft, browOuterUpRight)` | `0..100` |
| `au04` | *Brow Lowerer* | `mean(browDownLeft, browDownRight)` | `0..100` |
| `au06` | *Cheek Raiser* | `mean(cheekSquintLeft, cheekSquintRight)` | `0..100` |
| `au07` | *Lid Tightener* | `mean(eyeSquintLeft, eyeSquintRight)` | `0..100` |
| `au09` | *Nose Wrinkler* | `mean(noseSneerLeft, noseSneerRight)` | `0..100` |
| `au10` | *Upper Lip Raiser* | `mean(mouthUpperUpLeft, mouthUpperUpRight)` | `0..100` |
| `au12` | *Lip Corner Puller* | `mean(mouthSmileLeft, mouthSmileRight)` | `0..100` |
| `au14` | *Dimpler* | `mean(mouthDimpleLeft, mouthDimpleRight)` | `0..100` |
| `au15` | *Lip Corner Depressor* | `mean(mouthFrownLeft, mouthFrownRight)` | `0..100` |
| `au24` | *Lip Pressor* | `mean(mouthPressLeft, mouthPressRight)` | `0..100` |
| `au26` | *Jaw Drop / Lips Part* | `max(jawOpen, 0.7 * mean(mouthLowerDownLeft, mouthLowerDownRight))` | `0..100` |
| `blink` | *Blink (AU45)* | `mean(eyeBlinkLeft, eyeBlinkRight) >= 0.5` (en coeficiente crudo) | `boolean` |

Índices compuestos por instante $t$:
- **Sonrisa / Afinidad (`smile`, `0..100`)**: $\operatorname{round}(\operatorname{clamp}_{[0, 100]}(0.65 \cdot \text{au12} + 0.35 \cdot \text{au06}))$
- **Fricción / Ceño (`friction`, `0..100`)**: $\max(\text{au04}, \text{au09}, \text{au10}, \text{au15})$
- **Valencia Facial (`valence`, `-100..100`)**: $\operatorname{clamp}_{[-100, 100]}(\text{smile} - \text{friction})$
- **Sorpresa / Apertura (`surprise`, `0..100`)**: $\operatorname{round}\left(\sqrt{\frac{\text{au01} + \text{au02}}{2} \cdot \text{au26}}\right)$
- **Expresividad / Engagement Facial (`expressiveness`, `0..100`)**: media cuadrática (RMS) de las 12 AUs escalada a `0..100`.

---

## 4. Método `idt-video-v1` (Eye Tracking en Video y Gaze-Locked Affect)

1. **Reloj del medio (`t` en ms de `video.currentTime`)**:
   - Todas las muestras de mirada y de expresión facial se indexan respecto al tiempo de reproducción real del video (`0..300000` ms), nunca respecto al reloj de pared cuando el reproductor está en *buffering*.
2. **AOIs temporales y dinámicas (`resolveVideoAoiBox`)**:
   - Cada AOI de video define su ventana activa `[startMs, endMs]` y una caja base `box: [x0, y0, x1, y1]`, más una lista opcional de `keyframes` ordenados por `tMs` que se interpolan linealmente para seguir objetos en movimiento.
3. **Eventos oculares en video (`detectVideoGazeEvents`)**:
   - Extiende I-DT (`minDurationMs: 100`, `maxGapMs: 120`) con una tolerancia de dispersión de `0.05` de la diagonal para acomodar tanto fijaciones como seguimiento suave (*smooth pursuit*) de velocidad moderada dentro de una escena.
4. **Atribución Afectiva Condicionada a la Mirada (*Gaze-Locked Affect*)**:
   - Cuando una fijación cae dentro de una AOI en el intervalo $[t_{\text{in}}, t_{\text{out}}]$, se evalúan las muestras de Facial Coding con `poseValid: true` en $[t_{\text{in}}, t_{\text{out}} + 300\text{ ms}]$ (usando una ventana heurística de atribución, no una latencia validada para cada participante).
   - Esto reporta por cada AOI: `meanValenceWhileLooking`, `meanSmileWhileLooking`, `meanFrictionWhileLooking` y `meanSurpriseWhileLooking`.

---

## 5. Privacidad y cumplimiento legal

- **Cero video en red de la cámara del participante**: al igual que en `idt-image-v1`, ningún fotograma de la webcam ni la malla facial de 478 puntos sale del navegador del participante.
- **Datos transmitidos**: únicamente coordenadas $(x, y, t_{\text{video}})$ normalizadas y las 12 intensidades de Action Units cuantizadas (`0..100`) tras restar la línea base morfológica individual (sin enviar la geometría facial cruda; esto no constituye por sí solo una garantía de anonimato).
- **Etiquetado honesto**: la interfaz y el esquema declaran explícitamente `methodGaze: "idt-video-v1"` y `methodFacial: "fc-blendshape-v1"`, indicando que las métricas representan atención visual y expresión facial observada por webcam (no estados emocionales internos absolutos).

---

## 6. Alojamiento interno de videos de estímulo (Cloudflare R2 en servidor)

Los usuarios cargan los videos directamente desde la interfaz de la plataforma mediante `FilePicker` sin ver ni gestionar detalles de almacenamiento externo. En el servidor, Cloudflare R2 actúa como capa de almacenamiento de objetos S3-compatible para archivos `.mp4`/`.webm` hasta `150 MB`:

| Criterio | **Cloudflare R2 (Implementado en servidor)** | **Supabase Storage (`study-assets`)** |
| :--- | :--- | :--- |
| **Costo de salida (*Egress*)** | **\$0 USD / GB** (egress gratuito ilimitado) | Sujeto a cuota del plan y excedente por GB |
| **Precarga en `Blob` para 0 buffering** | Ideal para 30–100 participantes concurrentes descargando 30–50 MB a **costo \$0** | Multiplicaría el consumo de *egress* mensual |
| **Subida desde la plataforma** | URLs prefirmadas S3 (`PutObject` / `GetObject`) generadas en servidor con `AWS4-HMAC-SHA256` | Bucket actual restringido a imágenes (`10 MB` PNG/JPEG/WebP) |

1. **Cloudflare R2** almacena los archivos `.mp4`/`.webm` mediante [`r2.server.ts`](../src/tools/visual/video/r2.server.ts).
2. **Supabase (PostgreSQL)** conserva la configuración del estudio (`studies.config`) y las series temporales ligeras (`eye_tracking_runs`).

---

## 7. Decisiones de producto confirmadas

1. **Ejecución 100% nativa en la plataforma**: con corredor, resultados y exportación dentro de CognIA; el alojamiento usa R2 y la detección utiliza MediaPipe. No exige que el participante gestione esas integraciones.
2. **AOIs dinámicas con *keyframes* interpolados desde la primera versión**: implementadas en [`videoAoiSchema`](../src/tools/visual/video/schema.ts) y [`resolveVideoAoiBox`](../src/tools/visual/video/metrics.ts) con interpolación lineal `[x0, y0, x1, y1]` entre marcas de tiempo `tMs`.
3. **Reporte completo de Facial Coding**: se exponen tanto los **4 índices compuestos** (`valence`, `smile`, `friction`, `surprise`, más `expressiveness`) como el desglose de las **12 Action Units (FACS)** (`au01`..`au26`) y tasa de parpadeo (`blink`).


## 8. Adaptación a CognIA madre (2026-11-18)

El corredor de video de esta edición utiliza 18 puntos, referencia de pantalla con tarjeta ID-1 y distancia indicada por el participante. Las lecturas recientes se consumen una vez; la línea base requiere diez muestras faciales con pose válida. Se mantiene la validación independiente y los controles de deriva. Los índices faciales son estimaciones derivadas de blendshapes, sin certificación clínica de FACS o estados emocionales internos.

Las claves R2 se validan contra el estudio autorizado y los cambios se bloquean en servidor si existen respuestas o sesiones activas. Las URLs temporales se regeneran al abrir el video. Consulte `docs/backlog/cambios/COG-20261112-video-facial-eyetracking.md` para evidencias y pendientes de despliegue/configuración; la confirmación de código no acredita credenciales/CORS ni cámara física.
