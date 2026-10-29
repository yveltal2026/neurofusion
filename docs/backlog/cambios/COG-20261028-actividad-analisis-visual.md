# COG-20261028-actividad-analisis-visual — Actividad visible al analizar imágenes

- Fecha y responsable: 2026-10-28, Codex por solicitud del propietario.
- Estado: implementado localmente; pendiente de integrar.
- Tipo: mejora de interfaz.
- Alcance: compartido.
- Origen: `https://github.com/yveltal2026/neurofusion`, `fix/visual-analysis-feedback`, base `f53ec571a2884aab5901872521cb36a82057331e` de `main`.
- Commit de implementación: `e4bd3fc` — `feat(visual): show analysis activity and elapsed time`. Sin PR; integración directa en `main` autorizada por el propietario.
- Dependencias de otros cambios: ninguna; requiere el flujo visual individual y por lotes existente en la base.

## Problema y comportamiento

Durante una solicitud larga, «Analizando…» y el contador de imágenes terminadas dan poca señal de actividad. Se añade un indicador animado, tiempo transcurrido por solicitud y aviso al superar un minuto; la imagen activa del lote muestra una superposición. Se identifica explícitamente proveedor, modelo y motor en el resultado.

El reloj mide espera del cliente: no confirma etapas internas del servidor ni inventa porcentajes. La animación respeta la preferencia de movimiento reducido. El análisis individual oculta el resultado de la solicitud anterior mientras espera y confirma el guardado al terminar correctamente.

Criterios: indicador visible mientras hay una solicitud; reloj reiniciado por imagen; aviso al minuto; limpieza del temporizador al desmontar; resultado o error al terminar; el lote mantiene parada y reintento existentes.

## Archivos

- `src/tools/visual/ui/analysis-activity.tsx`: indicador y reloj aislados del resto del lote.
- `src/tools/visual/ui/analysis-activity.test.tsx`: espera, aviso, limpieza y reinicio.
- `src/tools/visual/ui/forms.tsx`: integración en análisis individual.
- `src/tools/visual/ui/asset-analysis-batch.tsx`: integración por imagen activa y superposición.
- `src/app/(app)/studies/[id]/assets/[assetId]/page.tsx`: etiquetas de metadatos.

## Dependencias y réplica

Sin paquetes nuevos, variables ni migraciones. Usa React, Tailwind y el flujo de acciones de la base. Si una edición tiene otro diseño o rutas, conserva el comportamiento y adapta colores y ubicación.

1. Aplica el commit `e4bd3fc` con `git cherry-pick -x e4bd3fc` después de traerlo del origen, o adapta los archivos anteriores si la arquitectura difiere.
2. Mantén las personalizaciones del destino y verifica que el componente sólo se monta durante la espera y cambia su `key` por imagen en el lote.
3. Ejecuta las comprobaciones descritas abajo.
4. En un entorno con acceso, analiza una imagen y un lote; verifica espera, finalización, fallo y parada tras la imagen activa. Registra evidencia propia en la matriz.

## Validación realizada en origen

- `npm run typecheck`: correcto tras instalar las dependencias del lockfile con `npm ci --no-audit --no-fund`.
- ESLint en los cinco archivos afectados: correcto.
- `npm test -- src/tools/visual/ui/analysis-activity.test.tsx src/tools/visual/ui/asset-analysis-batch.test.tsx src/tools/visual/actions.analysis.test.ts src/lib/ai/cascade.test.ts`: 67 pruebas correctas.
- `git diff --check`: correcto.

Sin comprobación funcional en navegador/producción ni en repositorios universitarios. No modifica el orden de modelos ni resuelve el diagnóstico de Gemini; véase COG-20261028-diagnostico-cascada-gemini.

## Recuperación

Revertir estos cambios de interfaz; no hay datos ni migraciones que revertir. El análisis del servidor conserva su comportamiento.

## Historial

- 2026-10-28: implementación y comprobaciones locales; incorporación al nuevo backlog.
