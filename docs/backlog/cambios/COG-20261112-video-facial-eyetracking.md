# COG-20261112-video-facial-eyetracking — Motor nativo de Facial Coding + Eye Tracking en video

- Fecha y responsable: 2026-11-12 (actualizado 2026-11-13) · Laboratorio de Neurociencias Anáhuac / CognIA.
- Estado del trabajo: integrado en `main` (flujo 100% nativo en plataforma: motores puros, cliente servidor Cloudflare R2, corredor de participante `VideoStudyRunner`, persistencia en `eye_tracking_runs`, visor analítico, exportación CSV y documentación; pendiente configurar credenciales `CLOUDFLARE_R2_*`, verificar despliegue Vercel y validar con cámara física).
- Tipo: mejora / datos / documentación.
- Alcance: compartido (compatible con la plataforma madre y con la edición Anáhuac, ejecutándose íntegramente dentro de la propia plataforma sin conectores externos).
- Origen: `alexis-anahuac/neurofusion-anahuac`, rama `main`, base `bdc713a`.
- Referencias de implementación: commits `41d0842`, `d959a92`, `580218d`, `11a94e3` y commit actual de ejecución nativa.
- Dependencias de otros cambios (IDs): `COG-20261028-eyetracking-movil`.

## Problema y comportamiento esperado

El módulo existente de eye tracking con webcam (`COG-20261028-eyetracking-movil`, método `idt-image-v1`) sólo admitía hasta 5 imágenes estáticas y descartaba la información de expresión facial que `@mediapipe/tasks-vision` (`FaceLandmarker`) puede producir en el navegador. Además, la plataforma debía ejecutar todo el ciclo de estudios de video + Facial Coding **de forma nativa dentro de la propia plataforma** (sin envíos ni menciones externas):

1. Extraer simultáneamente coordenadas de mirada y **Facial Coding (12 FACS Action Units + parpadeo + índices afectivos)** desde los 52 blendshapes ARKit de MediaPipe, con corrección por línea base neutra individual (3 s) y compuerta de pose de cabeza (`fc-blendshape-v1`).
2. Sincronizar las lecturas con el reloj real del video (`videoTimeMs`), soportar escenas temporales y AOIs estáticas o dinámicas por *keyframes* interpolados, y calcular la atribución afectiva condicionada a la mirada (*Gaze-Locked Affect*) con el método `idt-video-v1`.
3. Ejecutar toda la captura del participante (`/s/[token]`), almacenamiento de respuestas (`POST /api/s/[token]/eye/complete` -> `eye_tracking_runs`), visualización de resultados (`/studies/[id]/eye`) y exportación CSV (`/api/studies/[id]/eye/export`) nativamente en la plataforma, manteniendo Cloudflare R2 de forma transparente en el servidor para alojar los archivos de video hasta 150 MB.

## Implementación

- [`docs/VIDEO_FACIAL_EYETRACKING.md`](../../VIDEO_FACIAL_EYETRACKING.md): especificación técnica, fórmulas de Action Units e índices afectivos, arquitectura de sincronización en video y almacenamiento interno de videos en servidor.
- [`src/lab/facial/blendshapes.ts`](../../../src/lab/facial/blendshapes.ts) y [`src/lab/facial/blendshapes.test.ts`](../../../src/lab/facial/blendshapes.test.ts): motor puro `fc-blendshape-v1` (calibración de línea base neutra, extracción de pose `yaw/pitch/roll` desde la matriz $4\times 4$ de MediaPipe, mapeo a 12 FACS AUs, detección de parpadeo e índices compuestos de Valencia, Sonrisa, Fricción, Sorpresa y Expresividad).
- [`src/tools/visual/video/schema.ts`](../../../src/tools/visual/video/schema.ts): esquemas Zod de validación de escenas, AOIs dinámicas con *keyframes* interpolados, muestras de mirada y expresión facial en video y payload nativo `videoNeuroRunSchema`.
- [`src/tools/visual/video/metrics.ts`](../../../src/tools/visual/video/metrics.ts) y [`src/tools/visual/video/metrics.test.ts`](../../../src/tools/visual/video/metrics.test.ts): motor puro `idt-video-v1` (detección de eventos de mirada en video, interpolación de AOIs móviles, *Gaze-Locked Affect* con ventana fisiológica de $+300\text{ ms}$, series temporales agregadas con los 4 índices compuestos y las 12 FACS AUs, y mapas de calor por segmento de video).
- [`src/tools/visual/video/r2.server.ts`](../../../src/tools/visual/video/r2.server.ts) y [`src/tools/visual/video/r2.server.test.ts`](../../../src/tools/visual/video/r2.server.test.ts): cliente S3 compatible con AWS Signature Version 4 (`AWS4-HMAC-SHA256`) sin dependencias externas para generar URLs prefirmadas de subida (`PUT`) y reproducción (`GET` o CDN público) de uso interno en servidor.
- [`src/tools/visual/video/collector.ts`](../../../src/tools/visual/video/collector.ts) y [`src/tools/visual/video/collector.test.ts`](../../../src/tools/visual/video/collector.test.ts): cálculo del rectángulo real visible en `object-fit: contain` (descontando *letterboxing/pillarboxing*) y cuantización multimodal a 10 Hz.
- [`src/tools/visual/video/VideoStudyRunner.tsx`](../../../src/tools/visual/video/VideoStudyRunner.tsx), [`src/tools/visual/video/VideoNeuroRunner.tsx`](../../../src/tools/visual/video/VideoNeuroRunner.tsx) y [`src/tools/visual/eye/EyeStudyRunner.tsx`](../../../src/tools/visual/eye/EyeStudyRunner.tsx): corredor nativo de participante en `/s/[token]` con calibración de 9 puntos, validación de 8 puntos, controles de deriva `[0, 1]`, precarga en `Blob` (cero *buffering*) y ventana opcional de 3 s de línea base facial neutra.
- [`src/tools/visual/video/VideoAttentionAffectViewer.tsx`](../../../src/tools/visual/video/VideoAttentionAffectViewer.tsx) y [`src/app/(app)/studies/[id]/eye/page.tsx`](../../../src/app/%28app%29/studies/%5Bid%5D/eye/page.tsx): visor analítico nativo con superposición de AOIs dinámicas por *keyframes*, heatmap temporal, 4 índices compuestos, tabla de las 12 Action Units (FACS) y modo pantalla completa.
- [`src/app/api/s/[token]/eye/complete/route.ts`](../../../src/app/api/s/%5Btoken%5D/eye/complete/route.ts), [`src/tools/visual/eye/participant.server.ts`](../../../src/tools/visual/eye/participant.server.ts), [`src/app/api/studies/[id]/eye/export/route.ts`](../../../src/app/api/studies/%5Bid%5D/eye/export/route.ts) y [`src/tools/visual/video/routes.test.ts`](../../../src/tools/visual/video/routes.test.ts): persistencia nativa en `eye_tracking_runs` (reutilizando la columna `observations` `jsonb` sin migraciones SQL) y exportación CSV multimodal (`gaze` + `facial`).
- [`src/tools/visual/config.ts`](../../../src/tools/visual/config.ts), [`src/tools/eyetracking/config.ts`](../../../src/tools/eyetracking/config.ts), [`src/tools/eyetracking/actions.ts`](../../../src/tools/eyetracking/actions.ts), [`src/tools/eyetracking/ui/new-study-form.tsx`](../../../src/tools/eyetracking/ui/new-study-form.tsx), [`src/tools/eyetracking/ui/video-setup-card.tsx`](../../../src/tools/eyetracking/ui/video-setup-card.tsx), [`src/tools/eyetracking/ui/overview.tsx`](../../../src/tools/eyetracking/ui/overview.tsx), [`src/tools/registry.ts`](../../../src/tools/registry.ts) y [`src/app/(app)/projects/[id]/studies/new/eyetracking/page.tsx`](../../../src/app/%28app%29/projects/%5Bid%5D/studies/new/eyetracking/page.tsx): configuración unificada de estudios de Eye Tracking para elegir entre **Imágenes (hasta 5)** y **Video + Facial Coding**, con selector `FilePicker` nativo sin exponer detalles de infraestructura a usuarios finales.

No se modifican los archivos del paquete `COG-20261028-eyetracking-movil` (`src/lab/eyetracking/*`) ni `src/proxy.ts`, preservando intacta su paridad con el origen.

## Dependencias y configuración

- Dependencias nuevas: ninguna (el firmador S3 SigV4 para R2 usa `node:crypto` nativo y `@mediapipe/tasks-vision` ya forma parte del proyecto).
- Variables de entorno opcionales para almacenamiento interno de videos (sin valores secretos en el repositorio):
  - `CLOUDFLARE_R2_ACCOUNT_ID`
  - `CLOUDFLARE_R2_ACCESS_KEY_ID`
  - `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
  - `CLOUDFLARE_R2_BUCKET`
  - `CLOUDFLARE_R2_PUBLIC_BASE_URL` (opcional; si se configura debe incluir `https://` y sin `/` al final)
- Migraciones: ninguna (el esquema `eye_tracking_runs` existente soporta `observations` como arreglo JSONB de 1..5 elementos).

## Réplica

1. Copiar `src/lab/facial/`, `src/tools/visual/video/`, `src/tools/visual/eye/participant.server.ts`, `src/tools/visual/eye/EyeStudyRunner.tsx`, `src/app/api/s/[token]/eye/complete/route.ts`, `src/app/api/studies/[id]/eye/export/route.ts`, `src/app/(app)/studies/[id]/eye/page.tsx` y `docs/VIDEO_FACIAL_EYETRACKING.md` (ver detalle completo en [GUIA_REPLICA_COGNIA.md](../../replicas/anahuac-20261118/GUIA_ORIGEN.md)).
2. Copiar los ajustes de configuración y creación de estudios de Eye Tracking (`src/tools/visual/config.ts`, `src/tools/eyetracking/`, `src/tools/registry.ts` y `src/app/(app)/projects/[id]/studies/new/eyetracking/page.tsx`).
3. Configurar las variables `CLOUDFLARE_R2_*` en el entorno de destino y la política CORS del bucket (`AllowedMethods`: `GET`, `PUT`, `HEAD`; `AllowedHeaders`: `Content-Type`, `Cache-Control`) para habilitar la subida directa de MP4/WebM desde el navegador.
4. Ejecutar `npm run typecheck`, `npm run lint` y `npx vitest run src/tools/eyetracking src/tools/visual/video src/tools/visual/eye src/lab/facial src/app/s --maxWorkers=2`.

## Compatibilidad universitaria (obligatorio por destino)

- Edición y perfil: `alexis-anahuac/neurofusion-anahuac` (`main`), regido por [`docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md`](../COMPATIBILIDAD_UNIVERSITARIA.md) (`COG-20261028-compatibilidad-universitaria`).
- Impacto en registro, autenticación, roles, permisos, dominios y altas de alumnos: **no**. Inspeccionados `src/proxy.ts`, `src/app/(auth)/` y `supabase/migrations/20261029000000_academic_accounts.sql`; toda captura pública de participantes reutiliza `/s/[token]` y `/api/s/[token]/eye/*` (ya cubiertas por el prefijo público `/s/` y `/api/s/` en `src/proxy.ts`). Las acciones de subida de video y gestión de AOIs en `src/tools/eyetracking/actions.ts` reutilizan `requireUser()`.
- Adaptación necesaria: ninguna sobre el flujo de acceso universitario; se conservan íntegramente el branding Anáhuac Mayab, el dominio `@anahuac.mx` y la separación entre cuentas de maestro y alumno.
- Acreditación de maestro y dominios autorizados: sin cambios respecto a [`VALIDACION-2026-10-31.md`](https://github.com/alexis-anahuac/neurofusion-anahuac/blob/main/docs/backlog/VALIDACION-2026-10-31.md) (pendiente de identificar acreditación institucional independiente más allá del dominio `@anahuac.mx`).
- Acceso de alumnos: sin cambios; los alumnos siguen siendo dados de alta por profesores confirmados en `/students` y no tienen autorregistro.
- Comprobaciones: revisión del diff sin impacto en rutas de autenticación ni esquemas de usuarios; referencia a la verificación técnica en [`VALIDACION-2026-10-31.md`](https://github.com/alexis-anahuac/neurofusion-anahuac/blob/main/docs/backlog/VALIDACION-2026-10-31.md).
- Conclusión para el destino: **sin impacto en el flujo de acceso universitario** (certificación global de la instancia sigue sujeta a los pendientes institucionales registrados en `VALIDACION-2026-10-31.md`).

## Validación y limitaciones

- Comandos ejecutados en este entorno (`alexis-anahuac/neurofusion-anahuac`, Node v24.22.2):
  - `npx vitest run src/tools/eyetracking src/tools/visual/video src/tools/visual/eye src/lab/facial src/app/s --maxWorkers=2`: **16 archivos correctos, 66 pruebas aprobadas** (`eyetracking/*`: 22, `video/*`: 13, `eye/*`: 20, `facial/*`: 5, `app/s/*`: 6).
  - `npm run typecheck` (`next typegen && tsc --noEmit`): **correcto (0 errores)**.
  - `npm run lint` (`eslint`): **correcto (0 errores)**.
- Referencia en matriz de adopción: fila `COG-20261112-video-facial-eyetracking` en [`docs/backlog/ADOPCION.md`](../ADOPCION.md).
- Pendientes antes de uso en producción:
  - Configurar las credenciales reales `CLOUDFLARE_R2_*` en Vercel para activar la subida directa de videos desde la plataforma.
  - Validar en dispositivos reales con cámara física el flujo completo (`/s/[token]` -> calibración -> baseline 3 s -> video -> deriva final -> `/studies/[id]/eye`).
  - Los casos de aceptación institucionales de `COG-20261028-compatibilidad-universitaria` en el destino continúan sin verificar con cuentas reales (ver [`VALIDACION-2026-10-31.md`](https://github.com/alexis-anahuac/neurofusion-anahuac/blob/main/docs/backlog/VALIDACION-2026-10-31.md)).

## Recuperación

Eliminar los directorios nuevos `src/lab/facial/` y `src/tools/visual/video/`, el componente `src/tools/eyetracking/ui/video-setup-card.tsx`, y el documento `docs/VIDEO_FACIAL_EYETRACKING.md`, revirtiendo los cambios en `eyeTrackingConfigSchema`, `EyeStudyRunner.tsx`, `participant.server.ts`, `eye/complete/route.ts`, `eye/export/route.ts` y `studies/[id]/eye/page.tsx`. No hay migraciones de base de datos ni cambios en `package.json`.

## Historial de la ficha

- 2026-11-12: Investigación, diseño arquitectónico e implementación de los motores base `fc-blendshape-v1` y `idt-video-v1`.
- 2026-11-13: Configuración unificada de estudios de Eye Tracking para elegir entre Imágenes y Video + Facial Coding.
- 2026-11-13: Simplificación de etiquetas y selector `FilePicker` nativo en la plataforma sin exponer infraestructura externa a usuarios finales.
- 2026-11-13: Eliminación completa de conectores/menciones externas e integración 100% nativa en la propia plataforma (`/s/[token]`, `/api/s/[token]/eye/complete`, `/studies/[id]/eye`, exportación CSV) con controles de deriva `[0, 1]`.

## Incorporación a CognIA madre — 2026-11-18

El historial anterior describe el origen aportado por el propietario; no acredita comprobaciones realizadas en CognIA. Se recibe `paquete-cognia-20261118.tar.gz` y la guía de réplica. Huellas y commits del material en `docs/replicas/anahuac-20261118/PROCEDENCIA.json`.

- Destino: `yveltal2026/neurofusion`, rama `feat/anahuac-port-20261118`, desde `main` `6ecd180`. Implementación local; commit/PR, integración y despliegue pendientes.
- Incorporados los motores faciales/video, schemas, configuración unificada de estudios, almacenamiento R2, corredor, persistencia y exportación CSV, visor por tiempo/escenas/AOIs y documentación. Se conserva el servidor de sesiones y calidad de CognIA; sin nuevas dependencias o migraciones.
- Adaptaciones de CognIA: video con 18 puntos (base + fino y alternativa validada), referencia física de pantalla con tarjeta y distancia declarada, revisión de iluminación antes de calibrar, umbrales de validación existentes y controles de deriva 0/1. No usa anchos físicos inventados del paquete. El cambio de ventana/pestaña cancela y exige recalibrar.
- Lecturas de mirada/faciales tienen hora de captura: sólo se consumen una vez y dentro de 250 ms. La línea base exige al menos 10 muestras faciales recientes con pose válida; temporizador y video se cancelan al salir. El detector facial adicional usa CPU para compatibilidad con el fallo GPU observado en S25, con recuperación acotada; el motor móvil existente conserva su selección de backend y worker.
- La subida comprueba metadatos del archivo y guarda duración/tamaño; no persiste URLs R2 temporales como fuente permanente. El servidor limita claves al UUID del estudio autorizado y bloquea cambios de fuente/AOIs con respuestas o sesiones activas. Se prueba la denegación en solicitudes directas. Configuración pública de R2 requiere HTTPS. Guardado verifica duración cuando el estudio la declara.
- Variables requeridas para subida: `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`; `CLOUDFLARE_R2_PUBLIC_BASE_URL` opcional. No se copiaron credenciales ni se configuró una cuenta/bucket. CORS debe autorizar orígenes propios, GET/PUT/HEAD y cabeceras Content-Type/Cache-Control. Sin R2 sigue la alternativa de enlace directo compatible con CORS.
- Compatibilidad: no se importan identidad, proxy, autenticación o permisos universitarios. `requireUser()` y RLS del destino permanecen. Acceso institucional, acreditación de maestros y altas de alumnos en Anáhuac: sin verificar en esta sesión. La prueba de contrato no certifica una instancia universitaria.
- Validación: 331 pruebas iniciales correctas; pruebas añadidas de autorización/bloqueo de archivos, lecturas antiguas, línea base y cancelación. Recorrido de 18 puntos → validación → deriva inicial → video → deriva final → una sesión guardada probado con cámara/API simuladas. Suite ampliada: 342 pruebas correctas en 56 archivos; 27 pruebas focales correctas tras los últimos ajustes de metadatos. Otra prueba ejecuta la exportación real de ruta con BD simulada y comprueba las 24 columnas de mirada/facial: correcta. Se corrige el desfase del CSV de origen. Se prueba además el rechazo de mala luz antes de calibrar. Build webpack, tipos y lint correctos; dos pruebas de preparación de cámara en navegador de escritorio/móvil correctas. Fuentes con fixture temporal fuera del repositorio; estas comprobaciones no acreditan cámara o BD real.
- Límites: credenciales/CORS R2, subida real, guardado contra BD real y cámara física pendientes. La captura facial representa coeficientes/índices observados, no validación clínica de FACS ni inferencia garantizada de estados internos. El detector adicional CPU requiere medir rendimiento real.
- Recuperación: revertir código/configuración de esta entrega; conservar filas de video ya almacenadas para una reactivación compatible, pues revertir código no elimina resultados. No hay migraciones que revertir.

- Última comprobación de interfaz tras adaptar el texto al color de CognIA: 29 pruebas correctas (laboratorio de imágenes y corredor de video).
