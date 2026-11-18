# Guía de réplica e implementación hacia la plataforma madre (CognIA)

Fecha: 2026-11-18 · Repositorio origen: `alexis-anahuac/neurofusion-anahuac` (`main`, hasta `c218ba1`)

Este documento inventaria **todos los ajustes realizados en las últimas 3 semanas** (desde `2026-10-28`) en la edición Anáhuac y detalla el paso a paso para implementarlos de forma limpia y segura en el repositorio original de **CognIA** (en la otra cuenta de GitHub).

---

## 1. Inventario y clasificación de cambios (últimas 3 semanas)

| Rango / Commits | ID / Alcance | ¿Portar a CognIA? | Descripción |
| :--- | :--- | :---: | :--- |
| `e42a5a9..277ad00` (2026-10-28 a 10-29) | Identidad Anáhuac | **NO** | Logotipos Anáhuac Mayab, manual institucional, colores/tipografías y acceso académico (`@anahuac.mx`, altas de alumnos). |
| `11d2c31..a1fa3aa` (2026-10-31) | Paquete `2026-10-31.1` (`COG-20261028-eyetracking-movil`, `COG-20261030-imagenes-cuestionario`, `COG-20261031-informes-herramientas`) | **Ya sincronizado** | Confirmar que CognIA ya tenga estos 3 IDs; si alguno faltara, consultar sus fichas en `docs/backlog/cambios/`. |
| `b405e9f..bdc713a` (2026-11-12) | **`COG-20261111-analisis-imagenes-ia`** + mejoras UI/UX | **SÍ (Fase 1)** | Formato previo obligatorio, formatos impresos (`ppp`), Split View, `Tabs` segmentados, Fullscreen con zoom/paneo, tarjetas compactas de nuevo estudio, rediseño de `/report` y `/eye`, y ajustes de alertas/texto en calibración. |
| `41d0842..c218ba1` (2026-11-13 a 11-14) | **`COG-20261112-video-facial-eyetracking`** | **SÍ (Fase 2)** | Eye Tracking en video (`idt-video-v1`), Facial Coding (`fc-blendshape-v1`, 12 FACS AUs), almacenamiento en Cloudflare R2, runner `/s/[token]`, visor analítico `/studies/[id]/eye` y exportación CSV. |

> **Ventaja técnica:** Entre `a1fa3aa` y `c218ba1` **no hay nuevas dependencias en `package.json`** ni **nuevas migraciones SQL en `supabase/`**. Todo corre sobre el esquema y paquetes ya existentes.

---

## 2. Preparación antes de empezar en el repo original (CognIA)

1. Crea una rama limpia en el repositorio de CognIA a partir de su `main` actualizado:
   ```bash
   git checkout main && git pull
   git checkout -b feat/anahuac-port-202611
   ```
2. Si tienes acceso local a ambos repositorios clonados en la misma máquina, puedes copiar archivos directamente o aplicar los parches por rango de commits desde `neurofusion-anahuac`:
   ```bash
   # En neurofusion-anahuac, generar parches por fase (opcional):
   git format-patch a1fa3aa..bdc713a -o /tmp/fase1-imagenes-ui
   git format-patch bdc713a..c218ba1 -o /tmp/fase2-video-facial
   ```
3. **Regla de identidad al portar:** no sobrescribas archivos de marca, layouts raíz, autenticación ni `src/proxy.ts` de CognIA. Limítate a los archivos listados en las Fases 1 y 2.

---

## 3. Fase 1 — Análisis visual, formatos impresos y rediseño UI/UX (`COG-20261111-analisis-imagenes-ia`)

### Qué incluye
- **Formato obligatorio previo** al subir piezas gráficas y validación en servidor (`registerAsset`, `updateAssetMeta`).
- **Catálogo agrupado** (`Redes sociales`, `Publicidad display`, `Impresos`, `Web y correo`) y formatos impresos con cálculo de resolución efectiva (`ppp`) y tolerancia a rotación.
- **Split View** en `/studies/[id]/assets/[assetId]` con visor sticky de altura contenida, barra de herramientas en una fila y `Tabs` segmentados (`gridColumns`).
- **Pantalla completa (Lightbox)** con zoom in/out, rueda del ratón, paneo interactivo y cierre con `Escape`.
- **Tarjetas adaptables** en `AssetAnalysisBatch`, modernización de `/studies/[id]/report`, tarjetas compactas en `/projects/[id]/studies/new`, reordenamiento de `StudyTabs` y rediseño de `EyeResults` + `/studies/[id]/eye`.
- **Calibración móvil/webcam**: reubicación de alertas de error junto al botón de iniciar cámara/calibración y corrección de texto de instrucción a naranja.

### Archivos a copiar / integrar (`a1fa3aa..bdc713a`)

**Motor y acciones:**
- `src/tools/visual/engine/placements.ts`
- `src/tools/visual/engine/placements.test.ts`
- `src/tools/visual/actions.ts`

**Componentes UI compartidos y de análisis visual:**
- `src/components/ui/tabs.tsx` + `src/components/ui/tabs.test.tsx`
- `src/components/study-tabs.tsx` + `src/components/study-tabs.test.tsx`
- `src/tools/visual/ui/placement-select.tsx`
- `src/tools/visual/ui/uploader.tsx` + `src/tools/visual/ui/uploader.test.tsx`
- `src/tools/visual/ui/forms.tsx`
- `src/tools/visual/ui/overview.tsx`
- `src/tools/visual/ui/asset-panels.tsx`
- `src/tools/visual/ui/asset-analysis-batch.tsx`
- `src/tools/visual/ui/attention-viewer.tsx` + `src/tools/visual/ui/attention-viewer.test.tsx`

**Eye Tracking UI y calibración:**
- `src/lab/eyetracking/EyeTrackingLab.tsx` + `src/lab/eyetracking/EyeTrackingLab.test.tsx`
- `src/tools/eyetracking/ui/eye-results.tsx` + `src/tools/eyetracking/ui/eye-results.test.tsx`

**Páginas App Router:**
- `src/app/(app)/projects/[id]/studies/new/page.tsx` + `page.test.tsx`
- `src/app/(app)/studies/[id]/assets/[assetId]/page.tsx` + `page.test.tsx`
- `src/app/(app)/studies/[id]/report/page.tsx`
- `src/app/(app)/studies/[id]/eye/page.tsx`

### Validación de Fase 1
```bash
npm run typecheck
npm run lint
npx vitest run src/tools/visual src/tools/eyetracking src/components src/lab/eyetracking src/app --maxWorkers=2
```

---

## 4. Fase 2 — Eye Tracking en Video + Facial Coding + Cloudflare R2 (`COG-20261112-video-facial-eyetracking`)

### Qué incluye
- **Facial Coding (`fc-blendshape-v1`)**: extracción con `@mediapipe/tasks-vision` (`FaceLandmarker`) de 52 blendshapes ARKit → línea base neutra (3 s) → compuerta de pose (`|yaw| ≤ 35°`, `|pitch| ≤ 25°`) → 12 Action Units FACS (`au01`..`au26`) + parpadeo (`AU45`) + índices compuestos (*Valencia*, *Sonrisa*, *Fricción*, *Sorpresa*, *Expresividad*).
- **Eye Tracking en video (`idt-video-v1`)**: coordenadas ancladas a `video.currentTime` y al rectángulo real del video (`computeVideoContentRect`), AOIs temporales y dinámicas por *keyframes* interpolados, y *Gaze-Locked Affect* (ventana de $+300\text{ ms}$).
- **Almacenamiento interno en Cloudflare R2**: cliente S3 SigV4 sin dependencias (`node:crypto`), subida directa `PUT` desde el navegador (`.mp4`/`.webm` hasta 150 MB) y precarga en `Blob` en el participante para cero *buffering*.
- **Flujo completo**: creación unificada (`Imágenes` vs. `Video`), corredor `/s/[token]`, persistencia en `eye_tracking_runs.observations` (`eye-v3`), visor analítico en `/studies/[id]/eye` y exportación CSV (`gaze` + `facial`).

### Archivos nuevos a copiar (`bdc713a..c218ba1`)
- `docs/VIDEO_FACIAL_EYETRACKING.md`
- `src/lab/facial/blendshapes.ts` + `src/lab/facial/blendshapes.test.ts`
- `src/tools/visual/video/schema.ts`
- `src/tools/visual/video/r2.server.ts` + `src/tools/visual/video/r2.server.test.ts`
- `src/tools/visual/video/collector.ts` + `src/tools/visual/video/collector.test.ts`
- `src/tools/visual/video/metrics.ts` + `src/tools/visual/video/metrics.test.ts`
- `src/tools/visual/video/routes.test.ts`
- `src/tools/visual/video/VideoNeuroRunner.tsx`
- `src/tools/visual/video/VideoStudyRunner.tsx`
- `src/tools/visual/video/VideoAttentionAffectViewer.tsx` + `src/tools/visual/video/VideoAttentionAffectViewer.test.tsx`
- `src/tools/eyetracking/ui/video-setup-card.tsx`

### Archivos existentes a actualizar (`bdc713a..c218ba1`)
- `src/tools/registry.ts`
- `src/tools/visual/config.ts`
- `src/tools/visual/eye/participant.server.ts`
- `src/tools/visual/eye/EyeStudyRunner.tsx`
- `src/tools/eyetracking/config.ts`
- `src/tools/eyetracking/actions.ts`
- `src/tools/eyetracking/separation.test.ts`
- `src/tools/eyetracking/ui/new-study-form.tsx` + `src/tools/eyetracking/ui/new-study-form.test.tsx`
- `src/tools/eyetracking/ui/overview.tsx`
- `src/app/(app)/projects/[id]/studies/new/eyetracking/page.tsx`
- `src/app/(app)/studies/[id]/eye/page.tsx`
- `src/app/api/s/[token]/eye/complete/route.ts`
- `src/app/api/studies/[id]/eye/export/route.ts`

### Validación de Fase 2
```bash
npm run typecheck
npm run lint
npx vitest run src/tools/eyetracking src/tools/visual/video src/tools/visual/eye src/lab/facial src/app/s --maxWorkers=2
```

---

## 5. Configuración de Cloudflare R2 y Vercel en CognIA

Para habilitar la subida directa de videos en el despliegue de CognIA:

### 5.1 Variables de entorno en Vercel (y `.env.local` en desarrollo)
1. `CLOUDFLARE_R2_ACCOUNT_ID`: ID hexadecimal de la cuenta Cloudflare (sin `https://` ni dominio).
2. `CLOUDFLARE_R2_BUCKET`: nombre del bucket R2.
3. `CLOUDFLARE_R2_ACCESS_KEY_ID`: generado en **Storage & databases → R2 → Overview → Account Details → API Tokens (Manage) → Create Account API token** (permiso *Object Read & Write* limitado al bucket).
4. `CLOUDFLARE_R2_SECRET_ACCESS_KEY`: secreto S3 mostrado al crear el token.
5. `CLOUDFLARE_R2_PUBLIC_BASE_URL` *(opcional)*: URL pública (`r2.dev` o dominio propio). **Debe incluir `https://` y no terminar en `/`** (si falta `https://`, la validación `playbackUrl` rechazará el guardado con *"URL de video inválida"*). Si se omite, el servidor firma URLs `GET` temporales de 1 hora.

> Tras agregar o editar variables en Vercel, ejecutar siempre **Redeploy**.

### 5.2 Política CORS obligatoria en el bucket R2
En **Cloudflare → R2 → tu bucket → Settings → CORS Policy → Edit CORS policy**, configurar el origen exacto de CognIA (sin `/` al final):

```json
[
  {
    "AllowedOrigins": [
      "https://DOMINIO-DE-COGNIA.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "Content-Type",
      "Cache-Control"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

*(Sin `Content-Type` y `Cache-Control` en `AllowedHeaders`, el navegador bloqueará la subida `PUT`; sin `GET`, bloqueará la precarga en `Blob` del participante).*

---

## 6. Checklist de aceptación en producción (CognIA)

- [ ] `npm run typecheck`, `npm run lint` y `vitest` en verde en la rama de CognIA.
- [ ] En un estudio de piezas gráficas, el selector de formato bloquea la subida hasta elegir formato y calcula `ppp` en impresos.
- [ ] En `/studies/[id]/assets/[assetId]` funciona Split View, `Tabs` segmentados y Fullscreen con zoom/paneo.
- [ ] En un estudio de Eye Tracking en **Video**, el badge muestra **"Subida de video activa"**.
- [ ] Subida de `.mp4`/`.webm` desde `FilePicker` completa `PUT` a R2, guarda en Supabase y reproduce la vista previa.
- [ ] Sesión completa en `/s/[token]` con cámara física (calibración 9 pts → validación 8 pts → drift 0 → precarga `Blob` → baseline 3 s → video → drift 1) se guarda y visualiza en `/studies/[id]/eye` y se exporta en CSV.
