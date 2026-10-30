# COG-20261028-eyetracking-movil — Cámara móvil y medición visual de pantalla

- Fecha: 2026-10-28, implementación asistida por Codex.
- Estado: detección de rostro confirmada por el propietario en Android/Chrome tras PR #12; corrección de recortes, captura a baja frecuencia y preparación integrada en `main` mediante PR #13; repetición con cámara física pendiente.
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

## Seguimiento 2026-10-29 — Android/Chrome con 0 lecturas

El propietario confirma que la primera entrega no resolvió el síntoma en Android con Chrome: la cámara muestra imagen pero el indicador marca 0 lecturas/s. Esto acredita la persistencia del fallo; las pruebas con motor simulado de la primera entrega no demostraban detección real.

La inspección de WebEyeTrack 0.0.2 confirma dos limitaciones: fuerza MediaPipe con `delegate: GPU` dentro de su worker y carece de una ruta alternativa; además calcula la apertura ocular con coordenadas normalizadas sin corregir la proporción del frame. No se ha capturado una traza del teléfono que permita atribuir el fallo a una excepción concreta de ese dispositivo.

### Corrección de seguimiento

- En Android, iOS y dispositivos táctiles se usa MediaPipe por CPU en el hilo principal, sin instanciar el proxy/worker GPU de WebEyeTrack. Se conserva BlazeGaze 0.0.2 para la estimación de mirada y el ajuste propio existente. El adaptador a su detector interno está aislado en `mobile-runtime.ts` y tiene una prueba de contrato con el paquete WebEyeTrack real.
- Se fija `@mediapipe/tasks-vision` 0.10.35 como dependencia directa; JS y WASM usan la misma versión. No hay migraciones ni nuevas variables de producción. Los CDN/modelos externos siguen siendo necesarios.
- El frame móvil se centra en un canvas cuadrado con bandas negras, sin deformarlo ni recortarlo, para que la proporción vertical no altere la razón de apertura de los ojos. El video visible conserva su imagen original.
- Si pasan más de 8 segundos sin resultados tras el arranque, el motor libera recursos y muestra una interrupción del análisis. Se descartan las lecturas antiguas del indicador, se bloquea la calibración sobre un motor detenido y se ofrece reiniciar la cámara. En un estudio se conservan los bloques ya validados mediante la recuperación existente.
- Archivos adicionales: `mobile-runtime.ts`, sus pruebas unitarias y de contrato; cambios en `engine.ts`, `camera.ts`, `EyeTrackingLab.tsx`, sus pruebas y manifiestos de dependencias.

### Validación del seguimiento

- 113 pruebas correctas en 13 archivos con `npm test -- src/lab/eyetracking src/tools/visual/eye --maxWorkers=2 --testTimeout=20000`.
- TypeScript, ESLint de los archivos afectados y build de producción correctos. El build usa una fixture temporal de fuentes locales, fuera del repositorio, por las restricciones de red del entorno.
- Navegador: cuatro pruebas correctas en escritorio y Pixel 7 simulado sobre el build de producción; no certifican el nuevo detector facial.
- La prueba de contrato ejecuta `initialize()` y `step()` del paquete WebEyeTrack 0.0.2 real, con descargas y resultado de detección sustituidos. No utiliza cámara física ni demuestra sensibilidad del modelo ante un rostro.
- Pendiente: repetir en el Android/Chrome del propietario y medir detección y frecuencia con cámara real; comprobar Safari de iPhone. CPU puede reducir la frecuencia en teléfonos lentos: se mantienen los umbrales y controles de calidad, sin etiquetar mediciones deficientes como válidas.
- Compatibilidad universitaria: el seguimiento sigue limitado al cliente de cámara/mirada y sus dependencias. No modifica autenticación, roles, altas ni configuración institucional; otras ediciones continúan sin verificar y deben adaptar y validar el mismo ID antes de declarar una réplica completada.
- Referencia de implementación del seguimiento: `0484cd56b0843f197345f6a75a06ae1c2103cc0f`, [PR #12](https://github.com/yveltal2026/neurofusion/pull/12). Base verificada: `main` `1d53cf68d257ff9a34bab6038bb3dc7bedb70667`. Integrado en `main` mediante el merge `474cb986c3dbbd90588a841e154dbed8a03d579e` del PR #12, el 2026-10-29. Vercel preview correcto en `7f7329e`; despliegue de producción del seguimiento pendiente de verificar.

Para replicar, aplicar también el commit de este seguimiento después de `897ca9f` y ejecutar `npm ci` para instalar la dependencia directa. Revertir el seguimiento restaura la ruta anterior; no revierte ni elimina datos de participantes.

- 2026-10-29: PR #12 integrado en `main` (`474cb986c3dbbd90588a841e154dbed8a03d579e`); 113 pruebas, cuatro recorridos simulados, TypeScript, ESLint, build y preview de Vercel correctos. La validación de cámara física continúa pendiente.

## Seguimiento 2026-10-29 — Recortes ImageData, calibración a 10 FPS y preparación

El propietario confirma que los modelos sí terminaron de cargar y que se detecta el rostro en Android/Chrome. Observa unas 10 lecturas/s, fijación inestable y, más tarde, `Failed to construct ImageData: the requested image size exceeds the supported range`. No se atribuye este informe a una descarga que nunca finalizó.

### Causas verificadas y comportamiento final

- `obtainEyePatch()` de WebEyeTrack 0.0.2 obtiene la altura de una región de ojos a partir de una homografía y la pasa a `ImageData(512, alto)` sin acotarla. La prueba de contrato reproduce la excepción usando `prepareInput()` real, una matriz facial válida y landmarks cuyo recorte tiene altura negativa.
- `eye-region.ts` verifica geometría, finitud, homografía y límites del recorte antes de que el paquete asigne memoria. Un frame degenerado o un error concreto de asignación se convierte en lectura inválida, con coordenadas nulas; no cierra el motor ni reinicia el estudio. Otros errores siguen propagándose. No se corrigen ni se inventan coordenadas para aprobar esa lectura.
- La ventana anterior de 800 ms no podía reunir las diez muestras exigidas a 10 lecturas/s. Ahora se adapta entre 800 y 2200 ms y mantiene el mínimo de muestras, proporción válida, dispersión, deriva y frescura existentes. La prueba verifica que una fijación estable a 10 FPS avanza y que una señal ruidosa sigue siendo rechazada.
- La frecuencia mínima de validación final permanece en 15 lecturas/s. Si el equipo sigue entregando sólo 10, los resultados no se consideran válidos por reunir más muestras durante la calibración. La pantalla de posición informa de la baja velocidad tras el arranque.
- La preparación muestra su fase real, abre la cámara en paralelo a los modelos y limita la comprobación del modelo local a 10 s y la preparación completa a 90 s. Un intento cancelado no puede arrancar tarde, y los recursos que terminan de inicializar después de cancelar se liberan. La preparación lenta no se presenta como rostro ausente.

### Archivos y réplica

Se añaden `eye-region.ts`, `loading.ts` y pruebas; se actualizan `mobile-runtime.ts`, `engine.ts`, `calibration.ts`, `EyeTrackingLab.tsx`, sus pruebas y `e2e/eyetracking-lab.spec.ts`. Sin dependencias, variables ni migraciones nuevas. El código base de este seguimiento es `main` `94f075d`, después de PR #12. Referencia de implementación: `3bc0e2b75548330b0c9352d93fd3bfb91d7f4d88`, [PR #13](https://github.com/yveltal2026/neurofusion/pull/13), integrado en `main` mediante `c137614b0dc9053f057c4bf580bc4e279c6c38f7` el 2026-10-29.

Aplicar el seguimiento después de `0484cd5`, conservar las personalizaciones del corredor del destino y ejecutar los casos de prueba de recorte negativo, descarga fallida, cancelación y captura estable a 10 FPS. La compatibilidad de otras universidades sigue sin verificar; no se modifican registro, roles, permisos, dominios ni mecanismos de alta.

### Validación y límites

- 125 pruebas correctas en 14 archivos mediante `npm test -- src/lab/eyetracking src/tools/visual/eye --maxWorkers=2 --testTimeout=20000`.
- Regresión con el paquete WebEyeTrack real: reproduce la asignación inválida original; con el adaptador no se intenta esa asignación y se procesa un siguiente frame.
- TypeScript, ESLint y build de producción correctos; para el build se usa la fixture temporal de fuentes fuera del repositorio.
- Navegador: seis pruebas correctas en escritorio/móvil simulado, incluyendo un fallo de descarga que vuelve al formulario y permite reintentar. El simulador no demuestra la precisión del detector real.
- Falta repetir con la cámara del Android/Chrome del propietario y comprobar si su frecuencia alcanza el mínimo de calidad. No se ha medido una mejora de FPS en hardware real ni se afirma que se haya alcanzado 15 FPS. Los modelos externos no se descargan en estas pruebas del entorno.
- Para revertir, revertir el commit de este seguimiento. No hay migraciones ni cambios en datos que revertir.

- 2026-10-29: PR #13 integrado en `main` (`c137614b0dc9053f057c4bf580bc4e279c6c38f7`); Vercel preview correcto en `a029369`. La validación física del recorte y la frecuencia continúa pendiente.

## Seguimiento 2026-10-29 — Preparación guiada, exposición de cámara y motivos de rechazo

El propietario informa de dos calibraciones con buena luz y teléfono inmóvil que no permiten avanzar. La pantalla del participante sólo decía «precisión baja»: no mostraba `session.verdict.reasons`. Se desconoce cuál de los criterios falló en esas dos ejecuciones; no se atribuye automáticamente a iluminación. La frecuencia anterior de unas 10 lecturas/s puede incumplir por sí sola el mínimo de validación de 15.

### Comportamiento

- Se eliminan los selectores de iluminación y rigor, en escritorio y celular. Se exige buena luz frontal y se fija la calibración completa de 18 puntos (base y ajuste fino). Se conserva la indicación de lentes.
- Antes de calibrar se estima exposición con una muestra local de cámara de 64×48, independiente de las bandas del frame de inferencia. Se buscan oscuridad marcada, contraluz y sobreexposición en la zona central donde se pide colocar el rostro. Cuatro muestras consecutivas (un segundo) evitan reaccionar a una oscilación breve de exposición automática.
- La calibración está bloqueada mientras se comprueba la exposición o se detecta un problema. Se solicita cambiar de lugar/buscar luz frontal o reducir luz directa según el caso. La comprobación se repite al volver a posición y antes de recalibrar. Si no se puede leer el video, se informa y se ofrece reiniciar.
- En celular se recomienda un soporte o stand fijo en la pantalla de posición y se mantiene una leyenda durante los puntos de calibración.
- Un rechazo de validación muestra los motivos concretos calculados, con indicaciones distintas para frecuencia insuficiente o problemas de precisión/cobertura. Recalibrar conduce primero a posición e iluminación. Se conservan los criterios de calidad y el bloqueo de mediciones no validadas.

### Implementación, réplica y validación

- Implementación: `e3ab6e9801cea7828cdc766327fb75a155549f7a`, rama `fix/eyetracking-guided-quality`, basada en `main` `0d8ac9c`; [PR #14](https://github.com/yveltal2026/neurofusion/pull/14), integrado en `main` mediante `00036b3d537e2a102c15176f80f110de054ea5f0`. Archivos: `lighting.ts`, `lighting.test.ts`, `EyeTrackingLab.tsx` y sus pruebas.
- Sin dependencias, variables ni migraciones nuevas. Los píxeles de comprobación se procesan localmente, no se almacenan ni se envían. La condición `buena` representa el requisito del protocolo después de superar la comprobación, no una medición de lux.
- Para replicar, aplicar después de `3bc0e2b`, conservar identidad/flujo propios y repetir casos de exposición, 18 puntos, motivos de rechazo y soporte móvil. Sin cambios de autenticación, registro, roles o permisos; otras ediciones permanecen sin verificar.
- 130 pruebas correctas en 15 archivos, TypeScript y ESLint correctos. Incluyen protocolo completo de 18 puntos en los flujos de estudio, bloqueo por poca luz, recuperación al mejorar exposición, mensajes concretos de validación y leyenda móvil. Build correcto con fixture temporal de fuentes fuera del repositorio.
- Navegador: seis recorridos simulados correctos en escritorio y Pixel 7. El simulador omite la comprobación de video real sólo en laboratorio o preview permitido; no habilita el simulador en participaciones reales.
- Limitaciones: la evaluación de exposición es una heurística de imagen, no identifica todas las condiciones físicas de luz ni garantiza precisión ocular. Se prueba en imágenes sintéticas de distintas intensidades; falta validación con la cámara del propietario y más condiciones reales. No se afirma que la velocidad haya aumentado ni que las dos calibraciones reportadas ya superen el criterio.
- Recuperación: revertir este seguimiento devuelve los selectores y comportamiento anteriores; no hay cambios de datos que revertir.

- 2026-10-29: preparación guiada integrada en `main` mediante PR #14 (`00036b3d537e2a102c15176f80f110de054ea5f0`); preview de Vercel correcto en `9950298`. Falta validación del control de exposición y causas concretas de rechazo con la cámara del propietario.

## Seguimiento 2026-10-29 — Rendimiento en S25 Ultra e instrumentación

El propietario informa de 12.5 lecturas/s en un Samsung S25 Ultra con una sola pestaña. No se atribuye esa observación a falta de capacidad del teléfono. La ruta móvil de la implementación forzaba `delegate: CPU` en MediaPipe aun cuando el navegador dispusiera de GPU. Esto es una limitación de selección de backend; falta medir cuánto explica del rendimiento de ese teléfono.

- Se intenta MediaPipe por GPU en el hilo principal, sin volver al worker GPU que fallaba inicialmente. Si la inicialización o una detección fallan, se libera ese detector y se utiliza CPU. Se conservan las protecciones de recorte y todos los criterios de calidad, incluido el mínimo de 15 lecturas/s.
- Se solicita cámara a 30 FPS. El valor solicitado no se presenta como una frecuencia alcanzada.
- Desde lectura lenta y validación fallida se puede descargar `diagnostico-camara.json`. Registra backend activo, dimensiones y FPS reportados por la cámara, FPS de frames decodificados cuando el navegador ofrece el contador, FPS de lecturas procesadas, coste de copia de cámara y tiempos medios por etapa (detección, preparación, inferencia, filtro/lectura y total). Se usan hasta 120 muestras; no contiene imágenes, video, identificadores de cámara ni datos del participante.
- Los mensajes de lectura lenta solicitan revisar el diagnóstico en lugar de culpar automáticamente a otras apps o recomendar sustituir el dispositivo.
- Archivos: `mobile-runtime.ts`, `camera.ts`, `engine.ts`, `EyeTrackingLab.tsx` y pruebas de motor/runtime. Implementación `5bcf197a875d41653cf073d7086eed9ce3d78491`, [PR #15](https://github.com/yveltal2026/neurofusion/pull/15), basado en `main` `46d2586`. Integrado mediante `902c10a770fba28ef9dc3e142a330db6beb9e7ad` en `main`.
- Sin dependencias, variables ni migraciones nuevas. Para replicar, aplicar después de `e3ab6e9`, conservar las personalizaciones y repetir los casos de GPU, fallback inicial/en ejecución, limpieza de recursos y diagnóstico sin identificadores. Autenticación/roles no afectados; otras ediciones siguen sin verificar.
- Validación: 133 pruebas correctas, TypeScript, ESLint y build correctos. Dos comprobaciones de preparación en navegador (escritorio/Pixel 7 simulado) correctas. Las pruebas verifican la selección/fallback y una cámara/decodificación a 30 FPS frente a procesamiento a 10 FPS; no demuestran aceleración de hardware real.
- Exploración local: preparación de imagen del paquete real en aproximadamente 5 ms de media sobre 20 iteraciones, con fixture sintética y reconstrucción 3D sustituida. Excluye detección e inferencia y no es un benchmark del S25 Ultra ni confirma el cuello de botella en ese teléfono.
- Pendiente: repetir la calibración en el S25 Ultra y revisar su diagnóstico para verificar backend efectivo y frecuencia. No se afirma haber alcanzado 15 o 30 FPS en hardware físico.
- Recuperación: revertir PR #15 restaura CPU fijo en móvil. No hay datos o migraciones que revertir.

- 2026-10-29: PR #15 integrado en `main` (`902c10a770fba28ef9dc3e142a330db6beb9e7ad`); preview correcto en `644559d`. Rendimiento físico del S25 Ultra pendiente de medir con el diagnóstico.
