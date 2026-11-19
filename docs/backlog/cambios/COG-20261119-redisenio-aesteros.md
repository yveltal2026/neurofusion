# COG-20261119-redisenio-aesteros — Rediseño de la interfaz

- Fecha: 19 de noviembre de 2026.
- Estado: implementado en `feat/redisenio-visual`, [PR #27](https://github.com/yveltal2026/neurofusion/pull/27). Revisión del preview del tema y validación con cámara física pendientes.
- Tipo: mejora de interfaz y actualización de marca.
- Alcance: plataforma principal Aesteros (repositorio `yveltal2026/neurofusion`, base `76e146b`).

## Cambio

La interfaz incorpora el kit Aesteros v3.0: marca y favicon oficiales, Archivo variable, paleta claro/profundo, superficies y sellos de evidencia. Acceso, recuperación, proyectos y selector de herramientas usan el nuevo marco. Proyectos muestra los últimos estudios accesibles por el investigador.

El piloto de seguimiento ocular reúne ficha, invitación y estímulos. El editor de áreas separa imagen y controles y permite descartar cambios locales. Miradas y Sesiones tienen accesos propios, con las descargas y exclusiones existentes. Video, análisis visual, recorrido web, SEO, asociación implícita, variantes, encuestas, baterías, informes y calculadora comparten el sistema visual y usan las vistas y datos disponibles.

El espacio del investigador permite elegir Claro, Profundo o Sistema desde el encabezado. La cookie de apariencia se lee al renderizar el espacio de trabajo y los activos de marca siguen la selección. Las ligas del participante conservan su apariencia por dispositivo y los informes imprimen en claro.

## Decisiones de la entrega de interfaz

| Decisión | Aplicación en este corte |
| --- | --- |
| 1. Figuras SAM | Se conserva el instrumento vigente. |
| 2. Tareas de reacción siempre en oscuro | El corredor conserva su tratamiento anterior y la configuración de cada estudio. |
| 3. Estados de Core Web Vitals | Se conservan los umbrales y etiquetas. |
| 4. Puntuaciones como cifra con barra | El resumen SEO usa cifra y barra. El Índice de Fricción Digital conserva su gráfica existente con el sello de evidencia. |
| 5. Nombres en español y siglas secundarias | El selector presenta los nombres de cada herramienta tal como están en el registro actual. |
| 6. Criterios del análisis visual | Se conserva la terminología vigente. |
| 7. Marca de IA | El acento ámbar y el sello Estimado identifican predicciones y síntesis de IA. |
| 8. Valencia facial | Se conserva la lectura actual de los índices. |
| 9. Mapa de error de calibración | Los objetivos conservan el contorno y las lecturas usan el acento ámbar del sistema. |
| 10. Potencia de muestra | Se conservan las lecturas y fórmulas vigentes. |
| 11. Medidas de píxeles | Se presentan como cálculos vigentes por separado de las predicciones. |
| 12. Primer vistazo | Sigue siendo una vista del análisis visual. |
| 13. Nombre de la puntuación | Puntuación Aesteros. La fórmula se conserva. |

## Dependencias y réplica

El cambio reutiliza componentes de `src/components` y vistas de los módulos en `src/tools`. Los activos de la app están en `public/brand/aesteros` y la fuente OFL en `src/app/fonts`. El código usa los servicios, esquemas y endpoints existentes. El sitio público y el módulo académico Alumnos quedan fuera de esta entrega.

La réplica en universidades requiere adaptar el marco visual a cada identidad y revisar su implementación de acceso institucional. Se preservan acreditación docente, acceso de alumnos y políticas del destino. Estado en universidades: sin verificar.

## Validación y recuperación

Playwright comprobó seis recorridos del laboratorio en escritorio y móvil con calibración simulada. Chromium cubrió acceso, estudios existentes y nuevos, carga de imágenes, liga de participante, edición de áreas, miradas, sesiones y exportación CSV con un servicio local simulado. Se capturaron ocho vistas a 1440, 768 y 390 px en claro y profundo, y la vista de miradas se verificó en impresión. Lint y tipos aprobados. El selector se verificó en Playwright con Chromium a 1440, 768 y 390 px, con cambios de apariencia del dispositivo, persistencia tras navegar y recargar, render inicial con JavaScript desactivado, foco y versión imprimible. Las pruebas usaron autenticación simulada. El acceso y los datos de producción, el almacenamiento externo y la cámara física requieren verificación en destino. Para revertir, revertir el commit de interfaz. La entrega no introduce migraciones ni requiere revertir datos.
