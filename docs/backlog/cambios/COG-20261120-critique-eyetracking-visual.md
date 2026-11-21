# COG-20261120-critique-eyetracking-visual — Mejoras UX/UI en Eye tracking con webcam y Análisis visual con IA

- Fecha y responsable: 2026-11-20 · sesión `/impeccable critique` + corrección secuencial.
- Estado del trabajo: implementado localmente.
- Tipo: mejora.
- Alcance: compartido.
- Origen: `yveltal2026/neurofusion`, rama `feat/redisenio-visual`, commit base `6491ff7`.
- Referencias de implementación: pendiente (cambios locales sin commit).
- Dependencias de otros cambios (IDs): `COG-20261119-redisenio-aesteros`, `COG-20261111-analisis-imagenes-ia`, `COG-20261112-video-facial-eyetracking`, `COG-20261028-actividad-analisis-visual`.

## Problema y comportamiento esperado

La revisión `/impeccable critique` sobre las pantallas de Eye tracking con webcam y Análisis visual con IA (calificación 25/40) detectó cinco problemas prioritarios (P0–P2):
1. **P0**: La pantalla inicial de participante (`EyeTrackingLab.tsx`) mostraba cinco bloques simultáneos antes de encender la cámara y una espera opaca de hasta 90 s sin barra de progreso; además, el botón de salida de calibración (`×`) medía `24×24 px`, el modo libre dependía del color (`"El punto morado"`) y el fallo de calibración exponía `"Descargar diagnóstico de cámara"` al frente.
2. **P1**: `AttentionViewer` y `EyeResults` usaban botones rectangulares `rounded-md` fuera de `Button`, etiqueta `"Fullscreen"` en inglés, fondo `bg-black/92 backdrop-blur-sm` en lugar de `deep`, y paletas divergentes para AOIs (`#06b6d4` vs. `#FFB000`).
3. **P1**: `EyeResults` mostraba tres botones largos de descarga CSV juntos y dejaba `EyeKpiGuide` debajo del bloque de scanpath, lejos de la tabla con siglas (`TTFF`, `FC`, `FD`, `TFD`, `Dwell`).
4. **P2**: `AnalyzeAssetForm` (`forms.tsx`) no montaba `AnalysisActivity` durante esperas de 30–60 s en el análisis individual de pieza.
5. **P2**: Los formularios de creación (`visual/ui/new-study-form.tsx` y `eyetracking/ui/new-study-form.tsx`) desplegaban las 5 tareas de `journey` abiertas por defecto, no alertaban si las cuotas no sumaban 100 % y usaban `FACS` / `valencia` sin explicación llana.

Comportamiento final esperado:
- Flujo de participante en `EyeTrackingLab` secuenciado en 2 pasos (`Paso 1 de 2` privacidad y consentimiento; `Paso 2 de 2` pantalla y postura), barra de progreso `role="progressbar"` durante `loading`, botón de salida de calibración `44×44 px` (`rounded-full`), descripción independiente del color y diagnóstico técnico bajo `<details>`.
- Visores `AttentionViewer` y `EyeResults` unificados con `Button` / `buttonClass`, `"Pantalla completa"` en `es-MX`, `bg-deep/95` / `bg-deep-surface` sin `backdrop-blur-sm` y color de AOIs unificado en `#FFB000`.
- `EyeResults` con menú agrupado `"Exportar CSV"` y `<EyeKpiGuide />` inmediatamente debajo de la tabla de KPIs.
- `AnalyzeAssetForm` montando `<AnalysisActivity />` mientras `pending === true`.
- `NewVisualStudyForm` con tareas de recorrido colapsadas bajo `"Personalizar tareas"` y alerta si la suma de cuotas difiere de 100 %; `eyetracking/ui/new-study-form.tsx` con explicación llana de `FACS` y `valencia`.

## Implementación

- `src/lab/eyetracking/EyeTrackingLab.tsx`: `setupStep` (`1 | 2`), barra de progreso por etapas en `loading`, botón `×` de `min-h-11 min-w-11 rounded-full`, copia independiente del color en `stage === "free"`, diagnóstico técnico colapsado en `stage === "results"`.
- `src/lab/eyetracking/EyeTrackingLab.test.tsx`: actualización del flujo `setup` en 2 pasos y verificación de `role="progressbar"`.
- `src/tools/visual/ui/attention-viewer.tsx`: botones `Button variant="secondary" size="sm"`, `"Pantalla completa"`, modal con `bg-deep/95` y `bg-deep-surface` sin `backdrop-blur-sm`.
- `src/tools/visual/ui/attention-viewer.test.tsx`: actualización de etiqueta `"Pantalla completa"`.
- `src/tools/eyetracking/ui/eye-results.tsx`: `Button` / `buttonClass`, color de AOIs `#FFB000`, menú `"Exportar CSV"` y `<EyeKpiGuide />` justo debajo de la tabla.
- `src/tools/visual/ui/forms.tsx`: renderizado de `<AnalysisActivity />` cuando `pending === true` en `AnalyzeAssetForm`.
- `src/tools/visual/ui/new-study-form.tsx`: `customizeTasks` para resumir/personalizar las tareas de recorrido y validación visual de suma 100 % en cuotas.
- `src/tools/eyetracking/ui/new-study-form.tsx`: explicación llana de `FACS` y `valencia`.

- `src/components/ui/confirm-action.tsx`: diálogo modal `ConfirmActionDialog` para acciones destructivas de servidor.
- `src/app/(app)/studies/[id]/assets/[assetId]/page.tsx`: confirmación modal en `deleteAsset`, `text-xs` en SHA-256 y eliminación del doble CTA `Analizar con IA` en la barra superior cuando `!asset.ai`.
- `src/app/(app)/studies/[id]/eye/page.tsx`: confirmación modal antes de `Excluir` sesión (`participant_ref`).
- `src/tools/visual/ui/attention-viewer.tsx`: deshacer inline al eliminar área, `min-h-11` en editor de AOIs, `size-11` en botones de zoom, anillo `:focus-visible` y trampa/restauración de foco en modal fullscreen.
- `src/tools/eyetracking/ui/eye-results.tsx`: `bg-deep/95` y `bg-deep-surface` en modal fullscreen, controles `min-h-11`/`size-11`, trampa/restauración de foco, tooltips en cabeceras KPI y cierre de `Exportar CSV` con clic fuera y `Esc`.
- `src/lab/eyetracking/EyeTrackingLab.tsx`: telemetría cruda (`fps`, `validFps`, `lastDriftCheck`) reservada al investigador/diagnóstico; mensajes en lenguaje llano al participante; `min-h-11` en `<select>` y `motion-reduce:transition-none` en punto de calibración.
- `src/tools/visual/ui/asset-analysis-batch.tsx`: `role="progressbar"` estilizado en lugar de `<progress>` nativo.
- `src/app/(app)/projects/[id]/studies/new/eyetracking/page.tsx` y `src/tools/eyetracking/ui/new-study-form.tsx`: `.page-title` en `<h1>` y `bg-primary/5` unificado.

## Dependencias y configuración

Ninguna dependencia ni variable de entorno nueva; sin migraciones de base de datos.

## Réplica

1. Aplicar los cambios de los archivos listados en la sección de Implementación (o portar el commit cuando esté integrado).
2. Ejecutar pruebas unitarias focales, `npx next typegen && npx tsc --noEmit` y `impeccable detect --json --changed`.

## Compatibilidad universitaria (obligatorio por destino)

- Edición y perfil: plataforma madre (`yveltal2026/neurofusion`, rama `feat/redisenio-visual`); reglas en `docs/backlog/COMPATIBILIDAD_UNIVERSITARIA.md`.
- Impacto en registro, autenticación, roles, permisos, dominios y altas de alumnos: no. Todos los cambios son exclusivamente de interfaz de cliente y textos en vistas de estudio y participante.
- Adaptación necesaria: ninguna en autenticación o roles; al replicar a ediciones universitarias conservar sus rutas, layout y textos institucionales.
- Acreditación de maestro y dominios autorizados: sin impacto.
- Acceso de alumnos: sin impacto; no modifica `/s/[token]` ni el acceso sin cuenta de participantes.
- Comprobaciones: revisión de archivos modificados sin cambios en auth, middleware ni políticas RLS.
- Conclusión para el destino: plataforma madre validada localmente con pruebas unitarias y tipos; ediciones universitarias sin verificar (pendiente de réplica).

## Validación y limitaciones

- `npx vitest run ...` (6 archivos): 50/50 pruebas correctas.
- `npx next typegen && npx tsc --noEmit`: correcto, sin errores de tipos.
- `impeccable detect --json --changed`: 0 hallazgos.
- Segunda ronda `/impeccable critique`: puntaje subió de 25/40 (*Acceptable*) a 30/40 (*Good*), 0 hallazgos P0.
- Limitación: no se ejecutó inspección visual en navegador vivo porque no hay servidor Next.js activo ni variables `.env` de Supabase configuradas en este entorno.
- Referencia en matriz: `docs/backlog/ADOPCION.md` (fila `COG-20261120-critique-eyetracking-visual`).

## Recuperación

Revertir los cambios en los archivos listados (sin impacto en datos ni esquema de base de datos).

## Historial de la ficha

- 2026-11-20: creación tras `/impeccable critique` e implementación local secuencial de hallazgos P0, P1 y P2.
- 2026-11-20: segunda ronda `/impeccable critique` (25 → 30/40) y ajuste de telemetría reservada al investigador, blindaje de borrado/exclusión, foco/44 px en modales y consistencia visual.
- 2026-11-20: tercera ronda `/impeccable critique` (25 → 30 → 30/40, 0 P0) y ajuste de edición fluida de coordenadas AOI, validación explícita de escenas de video, leyenda en `Recorrido`, cierre automático de `Exportar CSV`, hit-targets ≥ 44 px y supresión de notas repetidas en informe.
- 2026-11-20: cuarta ronda `/impeccable critique` (25 → 30 → 30 → 33/40, 0 P0, 0 P1) y cierre de los últimos 3 puntos P2–P3: guardia `beforeunload` + aviso `dirty` + error inline en cruce de coordenadas en `AttentionViewer`, traducción de `device_type` en `eye/page.tsx`, `min-h-11` en botones de texto secundarios y `HEADER_HINTS` en `predicted-eye-metrics.tsx`.
- 2026-11-20: `/impeccable audit` (18/20, *Excellent*) y cierre de sus 4 hallazgos (`useFormStatus` en `ConfirmActionDialog`, `touch-none` en paneo con `zoom > 1`, botones `?` accesibles por teclado/táctil en `HEADER_HINTS` y `maxCardWidth` sincronizado con `resize` en `EyeTrackingLab`).
