# COG-20261111-analisis-imagenes-ia — Formatos y experiencia de análisis visual

- Incorporación en CognIA: 2026-11-18, a partir del paquete solicitado por el propietario. ID conservado del origen Anáhuac.
- Estado: implementado localmente; integración/PR y despliegue pendientes.
- Origen declarado: `alexis-anahuac/neurofusion-anahuac`, fase `b405e9f..bdc713a`; commits del paquete en `docs/replicas/anahuac-20261118/PROCEDENCIA.json`. Destino: `yveltal2026/neurofusion`, base `main` `6ecd180`, rama `feat/anahuac-port-20261118`.
- Tipo: mejora de interfaz y validación; alcance compartido.
- Dependencias: `COG-20261028-eyetracking-movil`, `COG-20261030-imagenes-cuestionario`, `COG-20261031-informes-herramientas`, confirmados en main antes de la réplica.

## Comportamiento e implementación

Antes de subir una pieza se exige elegir su formato, también validado en servidor. Catálogo agrupado de redes, display, impresos y web/correo; cálculo de resolución efectiva de impresos con tolerancia a rotación. Análisis con visor contenido y sticky, pestañas segmentadas, pantalla completa con zoom/rueda/paneo/Escape, tarjetas compactas y resultados/reporte reorganizados.

Archivos: `src/tools/visual/engine/placements*`, acciones y componentes de `src/tools/visual/ui/`; `src/components/ui/tabs*`, `study-tabs*`; páginas de nuevo estudio, pieza, reporte y eye; `src/tools/eyetracking/ui/eye-results*`; alertas/textos del laboratorio. La instrucción de calibración describe el punto relleno sin importar el naranja de Anáhuac, porque el color activo de CognIA es morado. La réplica no elimina los informes de IA previos ni las mejoras móviles.

## Configuración y réplica

Sin dependencias, variables ni migraciones nuevas. Procedencia e instrucciones originales en `docs/replicas/anahuac-20261118/`. Aplicar el diff adaptado, conservar componentes institucionales y repetir validación de formato en cliente/servidor, navegación, zoom/paneo, reportes y laboratorio. Commit/PR pendiente; no usar los commits declarados del origen como si pertenecieran al destino.

## Compatibilidad universitaria

Destino de esta entrega: CognIA madre. Diff acotado a herramientas, UI y documentación; no cambia proxy, login, registro, roles, membresías, logos, estilos raíz ni dominios. Las acciones mantienen `requireUser()` y cliente sujeto a RLS. Las políticas maestro/alumno de Anáhuac no se importan. La instancia universitaria y sus cuentas no se han inspeccionado en esta sesión: acreditación, acceso de alumnos, casos de aceptación y despliegue allí permanecen sin verificar.

## Validación y límites

Suite inicial del paquete: 331 pruebas correctas en 53 archivos. Suite ampliada: 342 pruebas correctas en 56 archivos. Tras las últimas comprobaciones de metadatos se repiten 27 pruebas de video/acciones/exportación: correctas. Build webpack y TypeScript correctos; ESLint sin advertencias; fuentes mediante fixture temporal externa al repo. Dos pruebas Playwright correctas en escritorio/Pixel 7 simulado sobre preparación de cámara/referencia. No acreditan cámara real, pantallas privadas con cuenta o llamadas a IA de producción. No se consultaron datos reales ni se ejecutaron migraciones. El changelog remoto de Supabase está bloqueado por la red (HTTP 403); se usan APIs del cliente ya instalado sin cambiar versión o esquema.

## Recuperación

Revertir el diff de esta entrega. Sin migraciones; preservar archivos y datos de estudios existentes. Actualizar la matriz con evidencia del repositorio de destino.

- Última comprobación de interfaz tras adaptar el texto al color de CognIA: 29 pruebas correctas (laboratorio de imágenes y corredor de video).
