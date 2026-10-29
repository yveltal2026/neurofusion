# COG-20261028-eyetracking-movil — Cámara móvil y medición visual de pantalla

- Fecha: 2026-10-28, implementación asistida por Codex.
- Estado: integrado en `main`; despliegue de producción pendiente de verificar.
- Tipo: corrección y mejora.
- Alcance: compartido.
- Origen: `yveltal2026/neurofusion`, `main`, `19c96bd762cd7a1dfce55fdb8239c33e80870ef7`.
- Rama: `fix/eyetracking-mobile`.
- Commit de implementación: `897ca9f0b6cf4aed9c0304f2edfcaefd6ab1e1e6`. [PR #10](https://github.com/yveltal2026/neurofusion/pull/10), integrado en `main` mediante el merge `15829993470b9d580f86bd19254addc671437191` el 2026-10-29.
- Dependencias de otros cambios: ninguna.

## Problema y comportamiento esperado

En celular puede verse la cámara sin que aparezca detección. El transporte de WebEyeTrack 0.0.2 inicia el bucle con `loadeddata`, llama `play()` sin esperarlo y abandona el bucle si el video sigue pausado. Además, la interfaz deducía «cara detectada» de la existencia de coordenadas válidas, confundiendo rostro visible con ojos cerrados o mirada no disponible.

La vista de cámara estaba antes de `ParticipantScreen`, por encima del logo. Se coloca dentro del paso de posición, inmediatamente antes de las acciones de calibración; también se muestra en recuperación. Se conserva el mismo elemento de video entre etapas y se reanuda tras cambiarlo de contenedor.

El tamaño físico no se puede obtener de forma fiable a partir de píxeles o densidad declarada por el navegador. La opción predeterminada permite ajustar en pantalla una tarjeta estándar ID-1 en vertical, sin introducir pulgadas. Se confirma la coincidencia y se usa el ancho realmente renderizado (lado corto: 5.398 cm). Se conserva una alternativa manual para quien conoce la diagonal. No se inventa una diagonal ni se omiten los controles de precisión.

## Implementación

- `src/lab/eyetracking/camera.ts`: una sola apertura de cámara frontal, atributos de reproducción móvil antes del stream, espera de `play()`, reintento de frames no decodificados, proporción natural y dimensión máxima de 640 px, reutilización del canvas y cancelación del bucle y tracks.
- `src/lab/eyetracking/engine.ts`: integra el transporte con el proxy existente; distingue landmarks faciales de mirada válida y libera recursos ante fallo, cancelación o timeout. Se elimina la apertura adicional de comprobación de permisos; los errores reales se propagan con mensajes accionables.
- `src/lab/eyetracking/EyeTrackingLab.tsx`: cámara junto a las acciones, reinicio de cámara, mensaje cuando existe rostro pero no mirada, ajuste con tarjeta y confirmación invalidada al cambiar referencia, dispositivo o geometría de pantalla.
- `src/lab/eyetracking/screen.ts` y `metrics.ts`: conversión física con referencia y metadatos opcionales de método/ancho en la exportación del laboratorio. Las exportaciones anteriores siguen siendo compatibles.
- Pruebas de cámara, motor, geometría, corredor y navegador en los archivos `*.test.*` correspondientes y `e2e/eyetracking-lab.spec.ts`.

## Dependencias y configuración

Sin nuevas dependencias, migraciones ni variables para producción. Conserva WebEyeTrack 0.0.2 y sus modelos/CDN actuales. La medición con tarjeta requiere una tarjeta de tamaño ID-1 y una distancia aproximada a los ojos. No se fotografía ni se transmite la tarjeta.

## Réplica

1. Partir del corredor equivalente del destino y revisar el diff, las personalizaciones y el contrato universitario.
2. Aplicar los archivos de cámara/motor/medición y adaptar los contenedores visuales preservando el branding del destino. Commit de implementación: `897ca9f0b6cf4aed9c0304f2edfcaefd6ab1e1e6`; aplicar con `git cherry-pick -x` sólo tras revisar compatibilidad y disponer de ese objeto en el destino.
3. Ejecutar las pruebas indicadas y comprobar un estudio completo, recuperación y exportación con la referencia visual y la alternativa manual.
4. Validar en Safari de iPhone y Chrome de Android con cámara real antes de declarar resuelto el síntoma en esos equipos. Actualizar esta ficha y la matriz con evidencia del destino.

## Compatibilidad universitaria

- CognIA, plataforma madre: diff limitado al corredor, transporte de video, métricas y pruebas/documentación; no modifica registro, autenticación, roles, permisos, dominios ni altas. No impone la política de acceso universitaria a la plataforma madre.
- Anáhuac Mayab y otras ediciones: sin verificar; no se inspeccionaron sus repositorios ni su configuración. Conservar acreditación de maestros, dominios institucionales autorizados y mecanismo de acceso de alumnos; no habilitar autorregistro de alumnos.
- Adaptación: únicamente equivalencias de interfaz y rutas si divergen; validación de acceso vigente del destino pendiente. No se certifica compatibilidad ni despliegue de otras ediciones.

## Validación y limitaciones

- `npm test -- src/lab/eyetracking src/tools/visual/eye --maxWorkers=2 --testTimeout=20000`: 104 pruebas correctas en 11 archivos. Incluye recuperación, controles de deriva, esquema y rutas con dependencias simuladas.
- `npm run typecheck`: correcto.
- ESLint de los archivos TypeScript/TSX modificados: correcto.
- Tras el último ajuste visual, se repitieron las 14 pruebas del corredor: correctas.
- `npm run build`: correcto, con la misma fixture temporal de fuentes usada en el navegador.
- `npx playwright test e2e/eyetracking-lab.spec.ts --reporter=line`: cuatro pruebas correctas en escritorio y Pixel 7 simulado (calibración, validación, deriva y exportación, además de ubicación de cámara y preparación sin pulgadas). Tras ampliar la referencia visual para pantallas estrechas se repitieron las dos pruebas de preparación: correctas, incluido ajuste al ancho máximo y ausencia de desbordamiento horizontal. Para las pruebas de navegador locales se sustituyen las fuentes de Google mediante `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` con una fixture temporal fuera del repositorio; la configuración de producción no cambia.
- No se dispone de cámara física de iPhone/Android. Los tests de reproducción y cancelación usan mocks; el simulador de mirada no demuestra detección facial real ni descarga de modelos en redes móviles.
- No se han escrito datos de participantes ni comprobado producción. Consultar `docs/backlog/ADOPCION.md` para estado por edición.

## Recuperación

Revertir los commits de esta mejora y repetir las pruebas del corredor. No hay migraciones ni datos que revertir; los metadatos opcionales de las exportaciones no requieren conversión.

## Historial

- 2026-10-28: implementación a partir del `main` verificado, pruebas locales y registro de pendientes de dispositivos físicos, integración y despliegue.

- 2026-10-29: integración autorizada por el propietario; PR #10 fusionado en `main` (`15829993470b9d580f86bd19254addc671437191`). Vercel y su comprobación de preview fueron correctos en `6168dff`; no constituyen verificación de producción ni de cámaras físicas.
