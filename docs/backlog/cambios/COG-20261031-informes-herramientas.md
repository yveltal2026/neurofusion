# COG-20261031-informes-herramientas — Informes por herramienta y reporte breve con IA

- Fecha y responsable: 2026-10-31 (America/Mexico_City), Codex a petición del propietario.
- Estado del trabajo: implementado localmente.
- Tipo: mejora.
- Alcance: compartido.
- Origen: `yveltal2026/neurofusion`, base `main` `45fabf0aa1d6b9227f6734855ca43cf9065b8b6f`, rama local `feat/study-report-dashboards`.
- Referencias de implementación: commit/PR pendientes; no integrado ni desplegado.
- Dependencias de otros cambios: herramientas de encuesta, visual y eye tracking existentes; miniaturas opcionales de preguntas compatibles con `COG-20261030-imagenes-cuestionario`.

## Problema y comportamiento esperado

La encuesta tenía estadísticas, pero no una sección que reuniera resultados, lectura de respuestas abiertas e informe con IA. Eye tracking no ofrecía una pestaña de informe. El informe visual detallado no ofrecía un resumen general ni una síntesis de todas las piezas.

Resultado:

- Encuesta: pestaña **Informe y resultados**, conteos, gráficas por pregunta e instrumento, bloques de precio, imagen de la pregunta cuando la hay y respuestas abiertas incluidas (hasta las 100 más recientes por pregunta; CSV completo). `/responses` redirige al informe sólo para encuesta.
- Eye tracking: pestaña **Informe**, muestra completa paginada de sesiones terminadas, categorías de calidad excluyentes, métricas por imagen y AOI (alcance, primera fijación, fijaciones, permanencia) y acceso a Miradas/CSV. No agrega sesiones limitadas, de baja calidad, excluidas o sin lecturas válidas. Los denominadores por imagen se calculan con el motor existente.
- Análisis visual: resumen de piezas analizadas y pendientes, criterios medios 1–5 y mejoras priorizadas, con acceso al detalle. No atribuye participantes a las estimaciones ni convierte imágenes pendientes en puntajes cero. Conserva mapas, lecturas por pieza e informe de journeys.
- En las tres: **Analizar con IA**, guardar el reporte, regenerarlo y aviso de datos cambiados. Resumen ejecutivo, hallazgos con evidencia, recomendaciones y limitaciones. Botones de actualización de resultados e impresión/PDF. Un fallo al leer/generar el reporte de IA no oculta las visualizaciones.

Criterios de aceptación: navegación válida, separación entre miradas medidas y predicción visual, mismo cálculo de métricas que las herramientas existentes, exclusiones respetadas, falta de datos explícita, respuesta de IA validada, guardado por estudio y lectura posterior, fallos recuperables, vista móvil sin desbordamiento de página. Sólo el investigador autenticado con acceso al estudio puede generar o leer informes.

## Implementación

- `components/study-tabs.tsx`: pestañas de informe para encuesta y eye tracking; conserva las especializadas de visual/journey/variantes.
- `app/(app)/studies/[id]/report/page.tsx`: distribuye entre encuesta, eye tracking y visual; reutiliza el informe detallado/journey. Límite de acción 120 s.
- `tools/reports/model.ts`, `schema.ts`, `prompt.ts`: agregados específicos por herramienta, elegibilidad y salida de IA validada. No se envían respuestas abiertas, datos de participante, trazas de mirada, imágenes ni rutas privadas al modelo.
- `tools/reports/load.ts`: carga con cliente del investigador/RLS; huella SHA-256 del agregado y lectura del último reporte por estudio, versión y origen.
- `tools/reports/actions.ts`: recalcula desde la base de datos; el cliente sólo manda el ID. Requiere 3 respuestas/sesiones incluidas o 1 pieza analizada. Tope de 10 reportes guardados por estudio/hora, error explícito si no puede comprobarse; entrada máxima al modelo 120.000 caracteres y señal de timeout de 100 s. Usa la capa/cascada de IA existente.
- `tools/reports/ui/*`: tableros de calidad, AOI y criterios, gráficas HTML accesibles, datos abiertos, PDF/CSV, actualización manual, formulario pendiente/error, informe guardado y aviso de obsolescencia.
- `tools/eyetracking/results/load.ts`: pagina todas las sesiones completas y observaciones, clasifica calidad sin solapar categorías y excluye registros incompletos. No envía identificadores al modelo.
- `tools/survey/ui/results-view.tsx`: miniatura opcional de la imagen evaluada, cargada de forma diferida mediante la liga de su estudio.
- `app/(app)/studies/[id]/responses/page.tsx`: redirección de encuestas; las variantes conservan sus resultados.
- `app/(app)/studies/[id]/data/actions.ts`: invalidación de informe y resultados después de excluir/reincorporar sesiones.
- `tools/visual/results.ts`: un fallo de lectura de piezas no se presenta como un estudio vacío.
- Pruebas de agregación, privacidad, elegibilidad, rutas, acción, guardado/errores, navegación y componentes; README, ficha, índice y matriz.

## Dependencias y configuración

Sin paquetes, migraciones ni variables nuevas. Se reutilizan los proveedores y la cascada de `lib/ai`, con sus claves y modelos existentes. Las cifras y gráficas se calculan sin llamadas al proveedor.

Los reportes se guardan en `public.analyses`, ya protegida con RLS de organización. `result` usa el sobre `kind: study_report`, `version: cognia-report-1`, `sourceKind`, `sourceHash` y `report`. `aggregates` conserva la instantánea numérica usada; no se guarda texto abierto ni filas crudas. `n_sessions` cuenta respuestas/sesiones incluidas y vale 0 para visual (el número de piezas está en el agregado). El filtro JSON evita confundir estos reportes con los análisis IAT existentes. Sólo se presenta el reporte más reciente de cada tipo/versión; las generaciones anteriores permanecen almacenadas.

## Réplica

1. Revisar configuración real de las tres herramientas, tabla `analyses`, RLS, proveedores y personalizaciones del destino. Conservar este ID.
2. Incorporar juntos rutas, cargadores, modelos, acción, componentes y pruebas. Commit pendiente: aún no hay un cherry-pick documentado ejecutable. Adaptar los equivalentes del destino si divergen.
3. No copiar secretos, modelos configurados, dominios ni políticas de registro. Confirmar que el cliente de investigador filtra por organización y que `analyses` permite el guardado previsto.
4. Validar cuestionario con todos sus formatos, eye tracking con sesiones válidas/limitadas/excluidas, piezas analizadas y pendientes, y conservación del informe journey/variantes.
5. Ejecutar las pruebas indicadas y un recorrido con cuentas y proveedor de prueba del destino: generar, recargar, recibir respuestas/excluir sesión, detectar obsolescencia y regenerar. Comprobar intento con otra organización.
6. Registrar commit/PR, validación y despliegue en la matriz sólo cuando exista evidencia.

## Compatibilidad universitaria

- CognIA, plataforma madre: revisión de los archivos de la entrega y de las políticas existentes de `analyses`. Las nuevas lecturas y la acción usan `requireUser` y el cliente con RLS; no cambian registro, login, roles, dominios ni altas de alumnos. Prueba con usuarios reales pendiente.
- Anáhuac Mayab y otras ediciones: sin aplicar ni inspeccionar. Conservar maestros/alumnos, autorregistro exclusivo de maestros acreditados con correo autorizado y acceso existente de alumnos según `COMPATIBILIDAD_UNIVERSITARIA.md`.
- Acreditación de maestro, dominios y acceso de alumnos del destino: pendientes de identificar. El dominio por sí solo no acredita el rol.
- Conclusión por universidad: sin verificar; no se declara lista para desplegar. Revisar diff adaptado y controles de acceso vigentes.

## Validación y limitaciones

- `npm test -- src/tools/reports src/tools/eyetracking src/tools/visual src/tools/survey src/tools/variants src/components/study-tabs.test.tsx 'src/app/(app)/studies/[id]/report/page.test.tsx'`: **51 archivos y 456 pruebas correctas**. Incluye agregados por herramienta, exclusiones, más de 100 sesiones, ausencia de datos, privacidad del prompt, guardado, cuota, errores de lectura/proveedor/persistencia, informe obsoleto, rutas y navegación. Tras corregir una opción de tipos de la prueba de pestañas se repitió esa prueba: correcta.
- TypeScript y `npx eslint` sobre todos los archivos de código afectados: correctos. `git diff --check`: correcto.
- `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/tmp/cognia-font-mocks.cjs npm run build`: compilación con Turbopack, comprobación completa de tipos y generación de páginas correctas. La pantalla temporal de comprobación no aparece en las rutas finales.
- Chromium/Playwright con componentes reales y datos simulados, **1360×900 y 390×844**, en encuesta, eye tracking y visual: pestaña activa, visualización, respuestas abiertas sin excluidas, enlaces CSV, actualización manual, llamada al diálogo de impresión/PDF, reporte guardado y aviso de obsolescencia. Las seis combinaciones terminaron sin errores JavaScript ni desbordamiento horizontal de página. Inspección visual de la captura móvil de eye tracking. La ruta temporal se eliminó antes de compilar. Capturas locales temporales en `/tmp/cognia-report-{survey,eye,visual}-{1360,390}.png`.
- Pruebas con base de datos y proveedor simulados. Sin llamadas reales a IA ni validación de persistencia en Supabase de producción; no hay credenciales de prueba configuradas en este entorno.
- El tablero de eye tracking consulta todas las sesiones completas, mientras Miradas conserva su límite existente de 100 sesiones recientes. Puede variar el tamaño de la muestra visible entre esas vistas; el informe indica su alcance.
- Los resultados abiertos se muestran sólo al investigador y no se entregan a la IA. Las muestras pequeñas se presentan como exploratorias; la redacción no convierte intención declarada o saliencia estimada en predicción de conducta.
- La generación es manual; las cifras se actualizan al abrir la página o pulsar Actualizar resultados. La huella detecta cambios en los agregados disponibles para la IA, no cambios textuales que no alteren esos agregados.
- El tope horario cuenta reportes guardados; no es una cuota distribuida y atómica para llamadas simultáneas. Se conserva el patrón del análisis IAT existente.
- Fuentes locales simuladas sólo para la comprobación de compilación/navegador por las restricciones de red; sin cambio de tipografía de producción.
- Integración, despliegue y compatibilidad universitaria pendientes; consultar `../ADOPCION.md`.

## Recuperación

Revertir los archivos del cambio devuelve las pestañas/rutas a su comportamiento anterior. Los reportes guardados permanecen en `analyses`, sin alterar respuestas, métricas ni análisis IAT. No hace falta revertir esquema. No borrar generaciones antiguas al revertir código.

## Historial de la ficha

- 2026-10-31: implementación local sobre `45fabf0`, sin referencias de commit/PR ni despliegue todavía.
