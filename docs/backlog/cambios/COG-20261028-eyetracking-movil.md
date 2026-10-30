# COG-20261028-eyetracking-movil — Cámara móvil y medición visual de pantalla

- Fecha: 2026-10-28, implementación asistida por Codex.
- Estado: seguimientos #10–#15 integrados en `main`; nueva incidencia de 46 análisis/s sin rostro en Android. Rostro confirmado por el propietario tras PR #16, con CPU a 10 FPS por error GPU. PR #17 integrado (`7679b62`); diagnóstico nuevo registra 17.86 FPS de promedio y el propietario sigue viendo 10/s antes de calibrar. PR #18 integrado (`1bb8a46`); diagnóstico físico posterior confirma 9.79 FPS con WebGL retenido. Detección CPU paralela integrada en `main` mediante PR #19 (`e15fa4c`); JSON físico posterior confirma worker CPU activo y 17.20 análisis/s, pero 80.83 % de mirada válida (aprox. 13.9/s). Lectura GPU asíncrona integrada en `main` mediante PR #20 (`8e539ed`); estado Vercel correcto y calibración física confirmada por el propietario. Recuperación tras dos imágenes corregida en PR #21 (`db4fc80`); estado Vercel de main correcto; repetición física pendiente.
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


## Seguimiento 2026-10-30 — Análisis sin rostro y diagnóstico siempre accesible

El propietario informa de 46 lecturas/s pero «cara no detectada» y confirma que no aparece el botón de diagnóstico. El indicador contaba todas las respuestas, incluidas las que no contienen landmarks. El diagnóstico se ocultaba salvo frecuencia baja; su ausencia con 46/s es reproducible por la condición de interfaz. No hay diagnóstico del teléfono que confirme todavía una incompatibilidad concreta de GPU.

- El detector móvil usa `runningMode: VIDEO` y `detectForVideo()` con timestamps de cámara en milisegundos estrictamente crecientes. MediaPipe puede aprovechar el seguimiento temporal en vez de reiniciar detección de imagen en cada frame; no se ha medido su efecto en la frecuencia del S25 Ultra.
- Tras cinco resultados GPU consecutivos sin rostro, se compara el mismo frame con un detector CPU. Sólo se conserva CPU si éste encuentra un rostro que GPU no encontró; si ambos devuelven vacío se mantiene GPU. Los sondeos se espacian cinco segundos, se libera el detector descartado y se conserva el manejo de cancelación. Un error del sondeo no interrumpe la GPU. Se mantienen los fallback previos por excepción.
- «Análisis por segundo» y «Lecturas de mirada válidas» se muestran por separado. «Ayuda con la cámara» está disponible siempre en posición e incluye la descarga, aunque haya muchos análisis y ningún rostro.
- El JSON añade `trackingMode`, `detectorFallbackReason`, `faceDetectionRatio` y `validGazeRatio` sobre hasta 120 resultados. No incluye imágenes ni identificadores; los umbrales de calidad permanecen intactos.
- Implementación: `e77a7caff859b0bc5bb008c727ebf35a1f32b008`, [PR #16](https://github.com/yveltal2026/neurofusion/pull/16), basado en `main` `aa7e1dc`. Integrado en `main` mediante `22f5154ad0c0e7a7658e2a14683fec7ab6b41271`; preview de Vercel correcto en `6609697`. Estado Vercel de `main` correcto para `22f5154`: https://vercel.com/neurofusion1/neurofusion/AGB5LbPHgu9HV2QfRvAZdcKBodPa; cámara física y flujo real en producción pendientes. Archivos: `mobile-runtime.ts`, `engine.ts`, `EyeTrackingLab.tsx`, sus pruebas y `e2e/eyetracking-lab.spec.ts`.
- Validación local: 136 pruebas correctas en 15 archivos, TypeScript y ESLint correctos. Incluyen GPU vacía/CPU con rostro, ambos vacíos sin cambiar backend, liberación de detectores y timestamps crecientes. Build de producción correcto con `npm run build -- --webpack` y fixture temporal de fuentes fuera del repositorio; Turbopack local falló por permisos de puertos del sandbox. Dos pruebas de navegador correctas sobre ese build (escritorio y Pixel 7 simulado), incluido el diagnóstico accesible sin frecuencia baja. Preview de Vercel correcto en `e77a7ca`. El contrato con WebEyeTrack real sustituye las descargas y el detector; no demuestra detección física.
- Réplica: aplicar este seguimiento después de `5bcf197` y su documentación, adaptar controles y ejecutar las mismas pruebas, incluido el acceso al diagnóstico con frecuencia alta. Sin dependencias, variables ni migraciones nuevas. Autenticación, registro, roles, permisos e identidad institucional no afectados; universidades sin verificar.
- Pendiente: reabrir el estudio en Samsung S25 Ultra/Chrome, comprobar rostro, lecturas válidas, backend/motivo de fallback y calibración completa. No se afirma detección corregida en hardware ni un mínimo alcanzado de FPS. Para revertir, revertir este seguimiento; no hay cambios de datos.


## Seguimiento 2026-10-30 — Diagnóstico real: CPU a 10 FPS tras error GPU

El propietario adjunta una captura del diagnóstico del Samsung S25 Ultra/Chrome después de PR #16. Confirma `detectorBackend: main-cpu`, `detectorFallbackReason: gpu-detection-error`, `trackingMode: VIDEO`, detección facial en el 100 % de 120 muestras y mirada válida en el 95 %. Procesamiento: 10.07 FPS; cámara reporta 30 FPS y decodifica aproximadamente 23.94 FPS. Copia de cámara: 15.55 ms; detector: 48.92 ms; preparación: 12.59 ms; inferencia etiquetada: 3.89 ms; lectura/filtro: 15.85 ms; total del motor: 81.42 ms (excluye copia). El informe acredita detección real y un fallo GPU seguido de CPU, pero no contiene la excepción original ni acredita una calibración válida.

### Implementación y alcance

- MediaPipe recibe explícitamente un `HTMLCanvasElement` propio para GPU, conforme a `VisionTaskOptions.canvas`. No se pide contexto 2D en ese canvas ni se comparte con TensorFlow o la captura. La omisión estaba en el código; no se afirma que sea la causa concreta del error físico sin conocer su excepción.
- Se desactiva `outputFaceBlendshapes`: el modelo adicional de expresiones no interviene en apertura ocular, pose ni BlazeGaze. Se conservan landmarks, matriz facial, resolución y criterios de calidad, incluido el mínimo de 15 FPS. No se sustituyen lecturas ni se reutilizan landmarks anteriores para aparentar mayor frecuencia.
- Si ya llegó otro frame durante una inferencia móvil, se cede el control mediante un temporizador sin esperar un ciclo adicional de pantalla. Sólo se procesa video decodificado nuevo, sin inferencias simultáneas; se cancela al detener. Si todavía no hay frame, se conserva el reintento con RAF.
- El diagnóstico añade `detectorGpuError` (nombre/mensaje acotado, URLs eliminadas, sin stack) y aclara que `kalmanFilter` incluye la lectura síncrona del tensor de TensorFlow, además del filtro. Los 15.85 ms no se atribuyen íntegramente al suavizado. Fallback y protección de regiones oculares se conservan.
- Archivos: `mobile-runtime.ts`, `camera.ts`, `engine.ts` y pruebas del runtime/cámara. Implementación `68060504dc1ca7642b1406f2825b0f09ec381ed4`, [PR #17](https://github.com/yveltal2026/neurofusion/pull/17), desde `main` `6bb69d2`. Integrado en `main` mediante `7679b62697d75c1ea82b10b0dea9f4dbc4b2c1aa`. Preview correcto en `85ba524`; estado Vercel de `main` correcto: https://vercel.com/neurofusion1/neurofusion/BmWTKU66713xP1zRPJpSgqUBF4SD. Rendimiento y flujo físico de esta optimización pendientes de comprobar.

### Verificación, réplica y límites

- 138 pruebas correctas en 15 archivos, TypeScript y ESLint correctos. Se comprueban canvas propios entre intentos, CPU sin canvas GPU, error de inicialización/ejecución preservado y acotado sin URLs, y procesamiento del frame recibido durante la inferencia sin esperar otro RAF. Tras el último ajuste de disponibilidad del frame se repiten 13 pruebas de cámara/motor: correctas.
- Build de producción con webpack correcto y fixture temporal de fuentes fuera del repositorio. Dos comprobaciones de preparación/diagnóstico correctas en navegador de escritorio y Pixel 7 simulado sobre el build de producción. Preview Vercel correcto para `6806050`. Las pruebas de MediaPipe sustituyen el modelo; el contrato con WebEyeTrack usa su código real con descargas/detección sustituidas. No demuestran GPU compatible ni aumento de FPS en el S25 Ultra.
- Sin dependencias, variables ni migraciones nuevas. Aplicar después de `e77a7ca`, adaptar equivalencias del corredor y repetir cancelación, fallback, disponibilidad de video y diagnóstico. Autenticación, roles, registro e identidad institucional sin cambios; universidades sin verificar.
- Falta reabrir estudio y descargar diagnóstico nuevo para confirmar backend, error GPU si persiste, frecuencia y calibración completa. No se declara alcanzado el mínimo de calidad. Recuperación: revertir este seguimiento, sin datos ni migraciones que revertir.


## Seguimiento 2026-10-30 — Selección de inferencia y caídas antes de calibrar

El JSON nuevo confirma `gpu-detection-error` en `FaceGeometryPipelineCalculator` / `procrustes_solver.cc` (`design_matrix.norm`), seguido de CPU. Registra 120 resultados, rostro en el 100 %, mirada válida en el 93.33 % y promedio de 17.86 FPS; el propietario aclara que sigue viendo 10/s antes de calibrar. Una media de unas 6.7 s no descarta caídas en la ventana de un segundo del indicador. Cámara decodificada: 24.01 FPS; captura: 5.03 ms; detector: 18.02 ms; preparación: 5.63 ms; inferencia etiquetada: 1.75 ms; lectura/filtro: 20.76 ms; total: 46.15 ms. La excepción identifica la geometría GPU como fallo real, pero no demuestra su causa interna. Existe un [reporte upstream abierto para S25 Ultra](https://github.com/google-ai-edge/mediapipe/issues/5908) con pérdida de detección GPU y uso de CPU como alternativa; las hipótesis de driver allí no se tratan como causas verificadas en este teléfono.

### Comportamiento e implementación

- En el arranque móvil se compara inferencia + lectura del mismo modelo BlazeGaze con el backend actual de TensorFlow y WASM. Se ejecutan dos calentamientos y cinco mediciones por candidato, sin guardar esas muestras en el estudio ni tocar el ajuste de calibración. La fixture sintética de imagen/pose es fija; las entradas y resultados temporales se liberan con `tf.tidy`.
- Sólo se elige WASM si la mediana mejora más de un 15 % y las dos salidas difieren como máximo 0.001 respecto a la referencia. Una alternativa lenta, no equivalente o fallida restaura el backend anterior. Se serializan carga de pesos y selección entre reinicios; cancelar restaura el estado anterior y no permite un inicio tardío. Si el mismo navegador ya tiene WASM seleccionado, se conserva.
- Se mantienen los pesos del modelo, preparación, filtro original, resolución, validación y mínimo de 15 FPS. La selección no modifica el detector facial CPU/GPU; el diagnóstico distingue ahora ese detector del backend de estimación de mirada.
- El diagnóstico añade `gazeBackend` (selección y medianas), `lastSecond` (análisis y mirada válida en la ventana de un segundo) y `phase`. Se conserva `processedFps` como media de hasta 120 muestras. No se incluyen imágenes ni identificadores del participante.
- Se fijan dependencias directas `@tensorflow/tfjs-core` y `@tensorflow/tfjs-backend-wasm` 4.22.0, igual que la versión TensorFlow incluida en WebEyeTrack 0.0.2. JS y motor comparten la instancia global de TensorFlow, comprobada por contrato. Los tres binarios oficiales WASM se sirven desde `/web/tfjs-wasm/4.22.0/`, con licencia Apache 2.0 y SHA-256 en su README (aproximadamente 1.1 MiB en total; se descarga la variante correspondiente). Un hilo; sin nuevas cabeceras de aislamiento, servicios ni CDN. Sin variables ni migraciones nuevas.
- Archivos: `gaze-backend.ts` y pruebas, adaptador móvil, motor/diagnóstico, corredor, manifiestos y `public/web/tfjs-wasm/4.22.0/`. Implementación `c060d4aee764f936511e5fcbb2de1e716babc40e` y serialización `b0c0c8023a61c72e6d7081f03063fdd19c9c9619`, [PR #18](https://github.com/yveltal2026/neurofusion/pull/18), desde `main` `7ba3762`. Integrado en `main` mediante `1bb8a46b0c2e8b4b5e1a915ca288075ef42e6b54`; preview Vercel correcto en `a423cbf`. Estado Vercel de `main` correcto para `1bb8a46`: https://vercel.com/neurofusion1/neurofusion/DKBDgKq1FAniW6npCseyz67VfL3X. Frecuencia, precisión y flujo con cámara física pendientes de comprobar.

### Evidencia y limitaciones

- 147 pruebas correctas en 17 archivos, TypeScript y ESLint correctos. Incluyen selección por mediana/paridad, alternativa lenta o divergente, descarga fallida, cancelación inicial/tardía, reinicio serializado y ventana de un segundo que descarta lecturas antiguas.
- Prueba de contrato nueva: carga pesos reales de `public/web`, inicializa el binario WASM real servido por el repositorio, compara backends y ejecuta `WebEyeTrack.step()` con pose/recorte y detección sustituidos. Verifica mirada finita y ausencia de crecimiento de tensores. No sustituye el modelo de mirada ni su filtro. Los tests previos del detector conservan mocks de MediaPipe.
- Build webpack de producción correcto con fixture temporal de fuentes fuera del repositorio. Dos pruebas de preparación/diagnóstico correctas en escritorio y Pixel 7 simulado. La interfaz usa el simulador, no certifica detección física.
- Exploración adicional en Chromium: bundle temporal fuera del repositorio con `gaze-backend.ts` y BlazeGaze reales, pesos y WASM servidos por la aplicación local. Se eligió WASM (medianas locales: WebGL 426.4 ms y WASM 19.8 ms); este navegador usa renderizado de prueba y entrada sintética, sin detector/cámara, y no constituye una medida ni proyección del rendimiento del S25 Ultra.
- Falta repetir en el teléfono: frecuencia por segundo antes de calibrar, backend de mirada elegido y sus medianas, precisión y estudio completo. La paridad en una fixture de arranque no certifica precisión en todas las condiciones. No se declara corregido el hardware GPU ni una frecuencia mínima estable alcanzada.

### Réplica y recuperación

Aplicar ambos commits después de `6806050` y `e77a7ca`, conservar personalizaciones y ejecutar `npm ci`. Copiar los tres binarios y licencia de la misma versión; verificar los SHA-256 del README, su respuesta como WASM y acceso público sin redirección de login. Al actualizar TensorFlow, cambiar juntos dependencias, ruta y binarios y repetir el contrato con pesos reales. No hay cambios de autenticación, roles, registro, permisos ni configuración institucional; otras universidades siguen sin verificar. Revertir este seguimiento restaura la selección anterior de TensorFlow; no hay datos ni migraciones que revertir.


## Seguimiento 2026-10-30 — CPU paralela con dos imágenes acotadas

El segundo JSON del propietario confirma fase `position`, 9.79 FPS de promedio y 11 análisis/lecturas válidas en el último segundo. Rostro: 100 %; mirada válida: 90 %. La comparación de PR #18 funcionó: conservó WebGL (6 ms) frente a WASM (18.6 ms). Durante el uso: CPU facial 46.81 ms, captura 12.67 ms, preparación 12.36 ms, inferencia etiquetada 3.94 ms, lectura/filtro 17.11 ms y total del motor 80.22 ms. Cámara decodifica 23.95 FPS. El problema persiste con procesamiento serial; no se fuerza la alternativa más lenta ni se atribuye el informe a un contador mal leído.

### Comportamiento final

- Tras fallo GPU se prefiere un worker clásico con MediaPipe CPU/VIDEO. El cargador oficial puede usar `importScripts`; JS/WASM/modelo y sus opciones mantienen las versiones anteriores. Si el worker no inicializa o el navegador no lo permite, se conserva CPU principal con modo serial y motivo de error en diagnóstico.
- La cámara procesa una imagen en modo serial y como máximo dos cuando existe worker CPU. Se puede detectar el rostro de la siguiente imagen mientras el hilo principal prepara/estima la mirada anterior. Los buffers ImageData se transfieren al worker y vuelven con su ID, geometría y tiempo de detección. La imagen que consume BlazeGaze es la que produjo esos landmarks; no hay landmarks reutilizados para aumentar el contador.
- El primer fallo GPU sucede dentro de `WebEyeTrack.step`, que todavía necesita su imagen: sólo esa solicitud clona el buffer. Las siguientes transfieren y recuperan su propiedad. La resolución cuadrada máxima de 640 y el contenido del recorte ocular permanecen iguales.
- El modelo de mirada y su filtro conservan orden y exclusión mediante una cola. Las lecturas móviles llevan la hora de captura en `GazeFrame.t`, en vez de la hora de recepción: una imagen procesada tarde no se asigna al siguiente punto de calibración. FPS de procesamiento sigue usando entregas reales; `lastSecond` usa captura, igual que la interfaz. Se registra latencia de captura a resultado por separado.
- Iniciar se limita a 25 s para el worker; cada petición tiene 5 s de timeout. Cancelar termina el worker, rechaza pendientes y libera modelos al terminar la inferencia en curso. Un fallo del worker durante la medición interrumpe el motor y conserva la recuperación del estudio existente; no acepta datos tardíos ni crea una cola sin límite.
- Diagnóstico: `detectorBackend: worker-cpu`, `pipeline: cpu-worker-2-frame`, `detectorWorkerError`, `capture.peakInFlight` y `meanCaptureToResultMs`. Los tiempos representan latencia por imagen; con etapas solapadas su suma no equivale al inverso de FPS. Sin imágenes, IDs de persona ni video en JSON.
- Se conservan modelo/pesos, controles de recorte, puntos, filtros y umbrales de calidad. No se garantiza el mínimo de 15 FPS antes de medirlo en hardware.

### Referencias, pruebas y límites

- Implementación `34bc39b7a30b7284dc1349b47e2bd6c00259eabb`, [PR #19](https://github.com/yveltal2026/neurofusion/pull/19), desde `main` `6bce235`. Integrado en `main` mediante `e15fa4c933ff3184c0991f9d6e8e9a43ed0504cd`; preview Vercel correcto en `764da9d`. Estado Vercel de `main` correcto para `e15fa4c`: https://vercel.com/neurofusion1/neurofusion/EVRd8dCvsBBDdpC2YjfuNwSN7KMv. Cámara, frecuencia y ejecución en el teléfono pendientes de verificar. Archivos: `face-detector-config.ts`, protocolo, worker y cliente con sus pruebas; adaptador móvil, cámara y motor con pruebas. Las constantes previas se reexportan desde el adaptador para conservar consumidores.
- 157 pruebas correctas en 19 archivos, TypeScript y ESLint correctos. Incluyen dos imágenes distintas sin una tercera en espera, detección adelantada y filtro ordenado, asociación por ID, clonación inicial/transferencia posterior, inicialización tardía, errores, cancelación, timeouts y timestamp de captura en la lectura. Tras el último ajuste de limpieza del timer se repiten siete pruebas de cámara: correctas.
- Build de producción webpack y dos comprobaciones de interfaz/diagnóstico correctos en escritorio/Pixel 7 simulado; fuentes mediante fixture temporal fuera del repositorio. Turbopack local falla por restricciones de puertos del sandbox, sin cambio a la configuración productiva.
- Chromium real: cliente con un worker sintético confirma buffers originales separados/detach, retorno de ImageData de 640×640 y marcadores de imagen 17/29 asociados a sus IDs. En la misma fixture, 20 imágenes con detector de tiempo controlado de 47 ms y trabajo principal de 46 ms producen 10.37 FPS serial y 19.46 FPS con dos imágenes. Verifica concurrencia del transporte; no ejecuta el detector facial ni estima velocidad del S25 Ultra.
- También se ejecuta el worker compilado por webpack con el JS/WASM real de MediaPipe 0.10.35, interceptado desde los archivos del paquete instalado. Un modelo deliberadamente inválido llega al parser y devuelve `Unable to open zip archive`, confirmando arranque/cargador clásico. Esto no acredita inicialización completa con el modelo facial real ni detección; Google Storage no está permitido por la red del entorno. No se ha probado cámara física aquí.
- Vercel preview correcto para `34bc39b`; estado verificado por GitHub. El conector Vercel no tiene acceso al equipo `neurofusion1` (403), por lo que no certifica inspección de archivos/ejecución del preview remoto. La validación de runtime indicada es local.

### Réplica y recuperación

Aplicar este commit después de `c060d4a` y `b0c0c80`; sin dependencias, migraciones, variables, cabeceras ni dominios nuevos. Conservar personalizaciones y verificar que el bundler del destino emita el worker clásico y sirva sus chunks del mismo origen. Mantener JS/WASM de MediaPipe en la misma versión y probar CPU, fallback serial, cancelación y dos imágenes completas con cámara real; repetir estudio/calibración y observar FPS y latencia. Sin cambios de autenticación, registro, roles, permisos o configuración institucional; universidades sin verificar. Revertir PR #19 restaura la ejecución serial y sus tiempos de recepción; no hay datos ni migraciones que revertir.


## Seguimiento 2026-10-30 — 13–14 lecturas válidas y espera de GPU

El tercer JSON confirma `worker-cpu`, `cpu-worker-2-frame`, `peakInFlight: 2` y ausencia de error de worker. Registra 17.196 análisis/s, rostro en el 100 % de 120 resultados y mirada válida en el 80.83 %: aproximadamente 13.9 lecturas válidas/s, consistente con el reporte del propietario antes de calibrar. Cámara decodificada 23.84 FPS; captura 9.96 ms; detector 32.59 ms; preparación 14.82 ms; inferencia 3.94 ms; lectura/filtro 14.45 ms; latencia captura–resultado 99.58 ms. El archivo no distingue las causas de los 23 descartes; no se atribuyen a parpadeos, luz o dispositivo sin evidencia. GPU facial sigue fallando en geometría, pero la alternativa CPU paralela sí está operativa.

### Comportamiento y archivos

- `async-gaze.ts` implementa el paso móvil de WebEyeTrack 0.0.2 con `await Tensor.data()` en lugar de `arraySync()`. El hilo principal puede atender captura y mensajes del detector mientras termina la lectura GPU. Conserva `prepareInput`, pesos, entrada normalizada, ajuste afín, EAR 0.2, filtro original y límites de coordenadas; el filtro y `latestGazeResult` avanzan en orden después de la lectura.
- El tensor de salida se mantiene hasta completar la lectura y se libera en `finally`, incluso ante error. Cancelar no actualiza el filtro ni publica un resultado tardío; el runtime conserva la espera antes de liberar modelos. Las coordenadas no finitas se descartan antes del filtro para no contaminar lecturas posteriores. No hay nuevas inferencias simultáneas ni imágenes reutilizadas.
- `mobile-runtime.ts` conecta este paso a su detector existente. `engine.ts` registra `gazeReadback: async`, `validGazeFps`, motivos de descarte (`no-face`, `eyes-closed`, `invalid-eye-region`, `non-finite-gaze`) y tiempos separados `readback`/`filter`. Las ventanas se limitan a 120 resultados y se reinician con la cámara. No contiene imágenes ni datos de identidad.
- La vía de escritorio conserva el paso de la librería. Se mantienen resolución, 18 puntos, mínimo de 15 FPS y controles de precisión/iluminación. Los picos breves no acreditan frecuencia sostenida.
- Pruebas: `async-gaze.test.ts`, contrato de pesos reales, runtime móvil y motor. Sin dependencias, variables, migraciones ni cambios de interfaz, autenticación, registro o roles.

### Evidencia y límites

- 161 pruebas correctas en 20 archivos (`src/lab/eyetracking` y `src/tools/visual/eye`); TypeScript y ESLint correctos. Comparación con el paso original para secuencias con filtro acumulado y ajuste afín, ojos cerrados y ausencia de rostro; lectura pendiente/cancelación/error sin fugas, descarte no finito sin contaminar filtro y ventana diagnóstica de 120 resultados.
- Contrato con pesos reales de BlazeGaze y WASM real: coordenadas idénticas entre pasos síncrono y asíncrono; sin aumento de tensores. Detección y preparación se sustituyen en esa prueba, no es cámara real.
- Chromium real/WebGL con los pesos del repositorio, imagen/pose sintéticas y detector sustituido: cinco comparaciones con diferencia máxima de coordenadas 0 y aumento de tensores 0. Durante cada espera asíncrona se ejecutaron otros callbacks del navegador. El entorno usa renderizado de software y tiempos variables; no acredita aumento de FPS ni precisión en S25 Ultra.
- Build webpack de producción correcto, con fixture temporal de fuentes fuera del repositorio. En el sandbox inicial Chromium y build fallaron por restricciones de proceso; ambos se completaron con permisos de red del entorno. Sin modificación al bundler de producción.
- Rama `fix/eyetracking-async-readback`, desde `main` `e22035eef550dae6bbf675b71da05426acf13df5`. Implementación `9d2710e0272a9045ee46ab0fa32b2882f3bc42e5`, [PR #20](https://github.com/yveltal2026/neurofusion/pull/20), integrado en `main` mediante `8e539ed772abe58a5498a970391a9225b6039f7c`. Preview Vercel correcto para `9d2710e`: https://vercel.com/neurofusion1/neurofusion/HXz7jMrYJVYrFtAZQNaMX6bcDW73. Estado Vercel de `main` `8e539ed` correcto: https://vercel.com/neurofusion1/neurofusion/8EvWk15idjwJg5xZ4hjXoQ6o55Em. Runtime remoto no inspeccionado; el estado acredita despliegue, no FPS físicos. Rendimiento sostenido y calibración con teléfono físico: pendientes.

### Réplica y recuperación

Aplicar después de PR #19 y mantener WebEyeTrack 0.0.2, TensorFlow compartido y worker CPU. Repetir contrato contra el paquete exacto al actualizar versiones, cancelación con lectura pendiente, diagnóstico y calibración completa en hardware. Sin cambios institucionales; universidades sin verificar. Revertir este seguimiento restaura lectura síncrona sin migrar datos. Verificar en el nuevo JSON `gazeReadback`, `validGazeFps`, motivos de descarte y latencia; no certificar el mínimo por una ráfaga breve.


## Seguimiento 2026-10-30 — Acción de recuperación tras dos imágenes

El propietario confirma que tras PR #20 pudo calibrar y vio dos imágenes; el control siguiente pidió ajustar la mirada, pero el botón no permitió continuar. La pausa de control cada dos imágenes es parte del protocolo. Se reprodujeron dos bloqueos en el código: un cambio de altura mientras se muestra recuperación hacía que `startStudy()` sólo publicara un error y permaneciera en esa pantalla; un cambio detectado durante la presentación dejaba deshabilitada la acción principal por `needsCalibration`. No hay traza del teléfono que confirme cuál ocurrió en esa sesión.

### Comportamiento y archivos

- `EyeTrackingLab.tsx`: la acción principal de recuperación permanece disponible cuando se requiere recalibrar y lleva al paso de posición/iluminación. Si falta el motor, lleva a reiniciar cámara. Si el ajuste sigue siendo válido, ejecuta el control de tres puntos para reanudar. Etiqueta e instrucciones explican la acción correspondiente.
- Una discrepancia de tamaño detectada al pulsar invalida el ajuste y abre la preparación de recalibración; no se limita a cambiar el mensaje en la misma pantalla. La ruta común también atiende ausencia de sesión/ajuste o validación insuficiente. Cancela comprobaciones anteriores y conserva la comprobación de iluminación.
- Se mantienen la sesión iniciada, el último bloque validado y el registro de imágenes repetidas. Se repite sólo el bloque sin validar. El botón secundario de recalibración usa la misma preparación; no se muestra duplicado cuando esa ya es la acción principal.
- No cambian mediciones, puntos, umbrales ni guardado de calidad. Sin dependencias, migraciones, variables, identidad, autenticación, registro o roles nuevos.

### Verificación, referencias y límites

- `EyeTrackingLab.test.tsx`: dos pruebas fallaban antes del cambio y pasan después: cambio de altura en recuperación y cambio de geometría durante presentación. Se completan recalibración, reanudación y guardado con las mismas tres imágenes y una sola sesión de servidor. Otra prueba confirma reinicio de cámara después del bloque validado y continuación desde imagen 3.
- 163 pruebas correctas en 20 archivos de eyetracking y calidad visual, incluidos fallos persistentes, precisión limitada explícita, cancelación y conservación de bloques. Pruebas de flujo con cámara/API simuladas, no validación física del S25.
- Rama `fix/eyetracking-recovery-action`, desde `main` `793c37c`. TypeScript, ESLint y build webpack correctos (fixture temporal de fuentes fuera del repositorio). El primer typecheck coincidió con la regeneración de `.next/types` del build; se repitió al terminar y pasó. Implementación `5c9abd17aef1aee7d336aef77e597ad4127d58f9`, [PR #21](https://github.com/yveltal2026/neurofusion/pull/21), integrado en `main` mediante `db4fc80572619e2149a64604584f1d7f84dfc253`. Preview Vercel correcto: https://vercel.com/neurofusion1/neurofusion/5PZwhyFghFMk66zuqSbDjWJWzgfK. Estado Vercel de `main` `db4fc80` correcto: https://vercel.com/neurofusion1/neurofusion/8DfBeoh6tcTm9u2QidmjUqGLTVTQ. Runtime remoto no inspeccionado. Repetición física completa pendiente.

### Réplica y recuperación

Aplicar después de PR #20; repetir fallo después de imagen 2, cambio de altura al recuperar, recalibración y guardado sin duplicar sesión ni imágenes. Conservar políticas institucionales; universidades sin verificar. Revertir este seguimiento restaura los controles anteriores sin migrar datos.
