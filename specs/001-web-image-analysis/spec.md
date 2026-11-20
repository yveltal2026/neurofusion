# Feature Specification: Análisis de Imagen Web (Capturas de Sitio)

**Feature Branch**: `001-web-image-analysis`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "Separar el análisis de imagen web para dejarlo por fuera y donde se suban las capturas de pantalla del sitio, como un tipo de estudio propio dentro de Proyectos en una categoría enfocada a web."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear un estudio de Análisis de Imagen Web dentro de un Proyecto (Priority: P1)

Un investigador o analista entra a un proyecto existente, hace clic en **Nuevo estudio**, ve la categoría enfocada en web con la tarjeta dedicada de **Análisis de Imagen Web** (separada de *Análisis visual con IA* para piezas gráficas/anuncios), configura el estudio indicando el objetivo del sitio/pantalla y crea el estudio.

**Why this priority**: Es el punto de entrada obligatorio para separar conceptualmente y operativamente el análisis de interfaces web respecto al análisis de creatividades/anuncios.

**Independent Test**: Se puede probar creando un proyecto, abriendo el selector de nuevo estudio, seleccionando **Análisis de Imagen Web**, completando el formulario inicial y verificando que el estudio se crea con su tipo propio y queda accesible desde el proyecto.

**Acceptance Scenarios**:

1. **Given** un investigador autenticado en la página de un proyecto, **When** accede a *Nuevo estudio*, **Then** visualiza la tarjeta **Análisis de Imagen Web** dentro de la categoría enfocada en web, claramente diferenciada de **Análisis visual con IA** (piezas gráficas y anuncios).
2. **Given** el formulario de creación de **Análisis de Imagen Web**, **When** el investigador ingresa nombre del estudio, tipo de vista (p. ej. landing, checkout, dashboard) y objetivo de conversión/CTA esperado, **Then** el sistema valida y crea el estudio en el proyecto.

---

### User Story 2 - Subir capturas de pantalla del sitio (Desktop / Mobile / Flujo) (Priority: P1)

Una vez creado el estudio, el analista sube una o varias capturas de pantalla del sitio web (indicando si corresponden a escritorio o móvil, y opcionalmente ordenándolas como pasos de un recorrido web) para prepararlas antes de ejecutar el análisis.

**Why this priority**: Sin la carga estructurada de capturas web no es posible ejecutar ningún análisis visual o de fricción sobre el sitio.

**Independent Test**: Se puede probar subiendo capturas PNG/JPG/WebP desde la vista de activos del estudio, asignándoles dispositivo y orden, y verificando que persisten y se previsualizan correctamente.

**Acceptance Scenarios**:

1. **Given** un estudio de **Análisis de Imagen Web** en estado borrador o activo, **When** el analista sube una o varias capturas de pantalla válidas, **Then** las imágenes se almacenan de forma segura por organización y se muestran ordenadas con su etiqueta de dispositivo (Desktop / Mobile).
2. **Given** múltiples capturas subidas como flujo de pantallas, **When** el analista reordena o elimina una captura, **Then** el sistema actualiza la secuencia del estudio sin afectar otros estudios.

---

### User Story 3 - Ejecutar análisis UX/atención y consultar reporte web (Priority: P2)

El analista ejecuta el análisis sobre las capturas web cargadas y obtiene métricas orientadas a experiencia de usuario web: mapa de atención estimado, recorrido visual, zonas ciegas, prominencia del CTA, índice de fricción digital (cuando aplique flujo) y recomendaciones accionables.

**Why this priority**: Entrega el valor analítico principal del módulo separado, reutilizando las capacidades visuales existentes pero con interpretación específica para interfaces web.

**Independent Test**: Se puede probar disparando el análisis sobre al menos una captura web cargada y verificando que se generan las métricas deterministas, los hallazgos estructurados y la vista de resultados/reporte.

**Acceptance Scenarios**:

1. **Given** un estudio de **Análisis de Imagen Web** con al menos una captura cargada, **When** el analista solicita ejecutar el análisis, **Then** el sistema procesa las capturas y presenta mapa de atención, zonas ciegas, evaluación de CTA y recomendaciones UX/CRO.
2. **Given** un estudio con análisis completado, **When** el analista abre la pestaña de resultados o reporte, **Then** puede inspeccionar cada captura con sus overlays visuales y exportar/resumir los hallazgos del estudio.

---

### Edge Cases

- ¿Qué ocurre si el analista intenta ejecutar el análisis sin haber subido ninguna captura? El sistema bloquea la ejecución y muestra un mensaje claro indicando que debe subir al menos una captura.
- ¿Qué ocurre si se sube un archivo que no es imagen válida o excede el tamaño máximo permitido? El sistema rechaza el archivo antes de procesarlo con un error descriptivo.
- ¿Qué ocurre con los estudios previos de tipo `visual` que ya existían en la base de datos? Deben seguir funcionando y visualizándose normalmente sin pérdida de datos ni migraciones destructivas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El catálogo de herramientas dentro de Proyectos MUST ofrecer un tipo de estudio independiente para **Análisis de Imagen Web** dentro de la categoría enfocada a web, separado de **Análisis visual con IA** (que queda enfocado en piezas gráficas y anuncios).
- **FR-002**: El sistema MUST permitir configurar el estudio web con nombre, contexto de negocio/página (objetivo principal, público, CTA esperado) y modo de análisis (capturas individuales o flujo/journey de pantallas).
- **FR-003**: El sistema MUST permitir subir, ordenar, etiquetar (Desktop / Mobile) y eliminar capturas de pantalla del sitio web asociadas al estudio, protegidas por organización (RLS).
- **FR-004**: El sistema MUST calcular métricas deterministas de imagen y atención sobre las capturas web y utilizar IA únicamente para redactar hallazgos y recomendaciones UX/CRO estructuradas sobre dichas capturas y métricas.
- **FR-005**: El sistema MUST mostrar una vista de resultados y reporte específica para **Análisis de Imagen Web** con visor de atención, hallazgos por captura y resumen accionable.
- **FR-006**: Los estudios existentes de tipo `visual` (incluidos los creados previamente en modo `journey`) MUST mantener compatibilidad total hacia atrás sin romper lecturas, rutas ni resultados existentes.

### Key Entities *(include if feature involves data)*

- **WebImageStudy (`studies` con nuevo `tool_type`)**: Estudio dentro de un proyecto con configuración específica para evaluación de capturas web (objetivo, CTA esperado, modo single/journey).
- **WebScreenshotAsset**: Captura de pantalla asociada al estudio, con orden, tipo de dispositivo (`desktop` | `mobile`), dimensiones y referencia en almacenamiento privado.
- **WebVisualAnalysisResult**: Resultado estructurado por captura y resumen global del estudio (puntuación UX, mapa de atención, zonas ciegas, fricción y recomendaciones).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un investigador puede crear un estudio de **Análisis de Imagen Web** y subir su primera captura de pantalla en menos de 60 segundos desde la pantalla del proyecto.
- **SC-002**: 100% de los estudios existentes de tipo `visual` continúan abriendo sus configuraciones, activos y resultados sin errores tras el despliegue.
- **SC-003**: El 100% de las nuevas rutas, validaciones Zod y cálculos deterministas cuentan con pruebas unitarias y verificaciones de tipos/lint aprobadas (`typecheck`, `lint`, `test`).

## Assumptions

- Se reutilizará la infraestructura de almacenamiento de imágenes y el motor de análisis visual/journey ya existente en la plataforma (`src/tools/visual/`), adaptando su interfaz, prompts y registro para desacoplar el caso de uso web.
- Los estudios previos de tipo `visual` en modo `journey` permanecen accesibles bajo su tipo original por compatibilidad, mientras que todos los nuevos análisis de capturas web se crean bajo el nuevo tipo de estudio web.
- El análisis de URL en vivo con navegación real de usuarios corresponde a la Fase 2 (Eyetracking Web) y queda fuera del alcance de esta especificación.
