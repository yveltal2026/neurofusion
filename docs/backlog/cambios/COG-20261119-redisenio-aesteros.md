# COG-20261119-redisenio-aesteros — Rediseño de la interfaz

- Fecha: 19 de noviembre de 2026.
- Estado: primera entrega integrada en `main` mediante [PR #27](https://github.com/yveltal2026/neurofusion/pull/27), merge `a28ec45`. La navegación lateral se implementó en `feat/redisenio-visual`. Su integración en `main` y su despliegue quedan pendientes.
- Tipo: mejora de interfaz y actualización de marca.
- Alcance: plataforma principal Aesteros (repositorio `yveltal2026/neurofusion`, base `76e146b`).

## Cambio

La interfaz incorpora el kit Aesteros v3.0: marca y favicon oficiales, Archivo variable, paleta claro/profundo, superficies y sellos de evidencia. Acceso, recuperación, proyectos y selector de herramientas usan el nuevo marco. Proyectos muestra los últimos estudios accesibles por el investigador.

El piloto de seguimiento ocular reúne ficha, invitación y estímulos. El editor de áreas separa imagen y controles y permite descartar cambios locales. Miradas y Sesiones tienen accesos propios, con las descargas y exclusiones existentes. Video, análisis visual, recorrido web, SEO, asociación implícita, variantes, encuestas, baterías, informes y calculadora comparten el sistema visual y usan las vistas y datos disponibles.

El espacio del investigador permite elegir Claro, Profundo o Sistema desde el pie de la barra lateral. La cookie de apariencia se lee al renderizar el espacio de trabajo y los activos de marca siguen la selección. Las ligas del participante conservan su apariencia por dispositivo y los informes imprimen en claro.

## Segunda iteración: navegación lateral

El escritorio tiene una barra lateral fija para Proyectos y Calculadora de muestra. En pantallas estrechas los enlaces se abren desde Menú. Tema y cuenta quedan en un solo lugar. Dentro de un estudio, el panel contextual muestra el proyecto, el selector cuando hay otros estudios en ese proyecto y las secciones de la herramienta. Miradas y Sesiones conservan su selección al alternar entre ambas vistas de la misma ruta.

El marco aplica superficies sólidas en Claro y Profundo a proyectos, formularios, baterías, calculadora, estudios e informes. Proyectos usa tarjetas compactas y abre el formulario de alta en un diálogo. En el resumen de mirada, Participación muestra respuestas y cupo cuando existe, con acceso directo a la liga cuando el estudio está publicado y su estímulo está configurado.

Los layouts de `src/app/(app)` reutilizan `src/components/workspace-appearance.tsx`. El contexto y los enlaces de estudio se resuelven en `src/components/study-navigation.tsx`, `active-study-tabs.tsx` y `study-tabs.tsx` con los permisos existentes del investigador. Los estilos del marco viven en `src/app/globals.css`. Para replicar, aplicar los cambios visuales de esta rama y verificar la navegación por herramienta y la impresión en el entorno de destino. No hay migraciones ni nuevas variables.

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


En la segunda iteración se verificaron TypeScript, ESLint, compilación de producción y 1 318 pruebas automatizadas. Chromium con Supabase simulado cubrió acceso, alta de proyectos, pantalla de mirada, navegación por consultas, menú móvil por teclado, temas e impresión. Se revisó el ancho a 390, 768, 1024 y 1440 px. Queda pendiente probar la iteración en un despliegue conectado a Supabase.

## Tercera iteración: marco lateral translúcido y galerías de proyectos y estudios

Se actualizó el marco global de la plataforma (`src/components/workspace-appearance.tsx`, `src/components/study-navigation.tsx` y `src/app/globals.css`) con una barra lateral translúcida adaptable a Claro y Profundo, logotipo automático por tema, píldora tonal para la sección activa y tarjeta agrupada al pie para tema y cuenta. Se renovaron la galería de proyectos (`src/app/(app)/projects/page.tsx`, `src/components/project-list.tsx`), la galería de estudios (`src/app/(app)/projects/[id]/page.tsx`, `src/components/study-gallery.tsx`) y las tarjetas de selección de herramienta en `src/app/(app)/projects/[id]/studies/new/page.tsx`, manteniendo buscadores e íconos neutros entre sistemas operativos.

Validación local de esta iteración: `npm run typecheck` aprobado, `npx eslint src` aprobado sin errores ni advertencias, y 3 archivos de prueba (4 pruebas) aprobados (`src/components/project-list.test.tsx`, `src/components/study-gallery.test.tsx` y `src/app/(app)/projects/[id]/studies/new/page.test.tsx`). En corte de comparación posterior se aplicó la variante **Opción 1 (Cristal Cálido)** en `/projects`, `/projects/[id]` y `src/components/study-header.tsx` y se incorporaron tres mejoras de densidad y contexto: métricas reales por estudio (`sessions`, `visual_assets`, `seo_audits` y barra de progreso cuando hay `max_responses`), acceso rápido a los 3 estudios **Recientes** en la barra lateral (`src/app/(app)/layout.tsx` y `src/components/workspace-appearance.tsx`) cuando no hay un estudio activo, y mayor contraste entre barra lateral (`14.5rem`) y lienzo junto con cuadrícula de 3 columnas en `/projects`. Posteriormente se ajustó `modo-claro` en `src/app/globals.css` a una paleta neutra (`#f7f7f5` de fondo y `#ffffff` en tarjetas, conservando el ámbar `#ffb000` únicamente como acento), se sustituyó el `<select>` de tema en la barra lateral por una píldora segmentada (`Claro / Oscuro / Auto`) y se creó la pantalla de ajustes de usuario `/settings` (`src/app/(app)/settings/page.tsx`, `src/components/settings-panels.tsx` y `changeAccountPassword` en `src/lib/auth/actions.ts`) con cuenta, cambio de contraseña, apariencia, uso/créditos de IA y versión de la plataforma. Validado con `npm run typecheck`, `npx eslint src` y las pruebas de galería. Pendiente: integración en `main` y verificación visual en despliegue conectado a Supabase.

