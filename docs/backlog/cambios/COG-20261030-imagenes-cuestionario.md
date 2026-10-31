# COG-20261030-imagenes-cuestionario — Imágenes en preguntas del cuestionario

- Fecha y responsable: 2026-10-30 (America/Mexico_City), Codex a petición del propietario.
- Estado del trabajo: integrado en `main`.
- Tipo: mejora.
- Alcance: compartido.
- Origen: `yveltal2026/neurofusion`, copia de trabajo `work` actualizada desde `main`, base `b67b23c1dbb980770076b2a9a5d3fcbebbfad772`.
- Referencias de implementación: commit `73d2bfdc2e53cf9c624d366e778bc04faf76d2bb`, documentación `ab27024`, [PR #24](https://github.com/yveltal2026/neurofusion/pull/24) integrado en `main` mediante merge `f48f94844d853c4f0800cb12b8a8a3056dac1e04`. Despliegue de producción pendiente de verificar.
- Dependencias de otros cambios: ninguna nueva; requiere el cuestionario y Storage existentes en `main`.

## Problema y comportamiento esperado

El investigador no podía mostrar una imagen para que el participante la evaluara. Cada pregunta propia ahora admite una imagen opcional: selección única (incluyendo Sí/No), múltiple, Likert, texto libre, número y NPS. Agregar, cambiar y quitar funcionan desde la tarjeta de edición, con previsualización y descripción accesible opcional.

Criterios: la imagen se conserva al cambiar de formato, duplicar y mover una pregunta; se muestra completa junto al campo al responder; la respuesta conserva su validación y puntuación; no se agrupan escalas con imágenes distintas. Sin imagen, las encuestas existentes funcionan igual. Los instrumentos estandarizados y bloques de precio conservan sus formatos actuales; esta entrega añade adjuntos a las preguntas propias.

## Implementación

- `src/tools/survey/images.ts`, `engine/schema.ts`: metadatos opcionales validados; sólo rutas del bucket, sin URLs externas/base64; aplanamiento y agrupación de escalas.
- `builder/model.ts`, `QuestionCard.tsx`, `QuestionImageEditor.tsx`: archivo local, descripción, vista previa y liberación de URLs de objetos.
- `builder/SurveyBuilder.tsx`, `upload-images.ts`, `image-actions.ts`, `actions.ts`: reserva de borrador, subida directa con sesión/RLS y publicación únicamente después de verificar archivos. La acción anterior rechaza referencias que eludan la verificación. El formulario queda bloqueado durante la publicación; ante error se conserva el borrador local para reintentar y se intenta limpiar el borrador remoto.
- `images.server.ts`: verifica formato real mediante sharp, decodificación, extensión, 10 MB y 60 millones de píxeles; comprueba pertenencia al estudio y copia archivos al duplicarlo.
- `runner/QuestionImage.tsx`, `SurveyRunner.tsx`, `app/api/s/[token]/survey/images/[itemId]/route.ts`: imágenes del bucket privado servidas sólo mediante la liga de su encuesta y una referencia presente en su configuración. Incluye vista previa y baterías. Respuesta `private, no-store` para que una liga regenerada no siga funcionando mediante caché; mensaje y reintento si la imagen falla.
- `app/(app)/studies/[id]/actions.ts`: copias independientes y limpieza de archivos al eliminar encuestas; si falla la copia se limpia el intento sin entregar una copia rota.
- `app/(app)/projects/[id]/studies/new/survey/page.tsx`: duración máxima de 120 s para verificar imágenes al publicar.
- Pruebas junto a cada módulo; README, ficha, índice y matriz actualizados.

## Dependencias y configuración

Sin paquetes nuevos ni migraciones. Se reutilizan `sharp`, Supabase y el bucket privado `study-assets`, configurado por `20261013000000_seo_visual_tools.sql` (10 MB, PNG/JPEG/WebP, acceso por organización a partir del prefijo del estudio). Los metadatos se guardan en `studies.config`, versión 1, con campos opcionales.

Variables existentes: públicas de Supabase para el investigador, clave de servicio sólo en servidor para servir imágenes de participantes. No se imprimen valores ni se modifican claves o reglas de registro. La consulta de documentación de Storage mediante MCP confirmó el modelo privado; el changelog oficial no pudo consultarse porque la política de red devolvió HTTP 403.

## Réplica

1. Revisar el diff completo y la configuración del cuestionario, almacenamiento y permisos del destino. Conservar este ID.
2. Revisar el commit de implementación `73d2bfdc2e53cf9c624d366e778bc04faf76d2bb` y el [PR #24](https://github.com/yveltal2026/neurofusion/pull/24). Si el destino comparte historial y se ha revisado su compatibilidad, aplicar mediante `git cherry-pick -x 73d2bfdc2e53cf9c624d366e778bc04faf76d2bb`; en otro caso adaptar el comportamiento. Aplicar cliente y servidor conjuntamente, adaptando rutas si difieren.
3. Confirmar el bucket privado, límites, MIME y políticas existentes de pertenencia a organización; no copiar secretos ni sustituir permisos institucionales.
4. Ejecutar pruebas del cuestionario, baterías, acciones de duplicación y ruta de imagen, tipos y lint.
5. Con cuentas de prueba del destino, publicar una pregunta con imagen de cada formato, abrir la liga y una batería en móvil/escritorio, duplicar el estudio y eliminar el original; comprobar acceso de otra organización y regeneración de liga. Confirmar carga, validación y limpieza en Storage real.
6. Actualizar la matriz con commit/PR y evidencia del destino. El origen no certifica otra edición.

## Compatibilidad universitaria

- CognIA, plataforma madre: se revisó el diff de la entrega y las políticas existentes de Storage; las nuevas acciones reutilizan `requireUser` y RLS. No se modifican registro, autenticación, roles, dominios ni altas de alumnos. La ruta del participante mantiene el acceso por liga del estudio. Verificación con usuarios/Storage reales pendiente.
- Anáhuac Mayab y futuras ediciones: sin verificar; repositorios no inspeccionados ni modificados. Mantener maestros/alumnos, autorregistro exclusivo de maestros acreditados con correo autorizado y acceso existente de alumnos según `COMPATIBILIDAD_UNIVERSITARIA.md`.
- Acreditación de maestro y dominios autorizados del destino: pendientes de identificar; un dominio no acredita el rol.
- Acceso de alumnos: conservar el mecanismo del destino; esta entrega no habilita autorregistro ni autoasignación de roles.
- Conclusión para universidades: sin verificar; pendiente de revisión del diff adaptado y verificación vigente de controles institucionales.

## Validación y limitaciones

- Instalación: `npm ci --ignore-scripts` con el lockfile de `main`, sin cambios de dependencias.
- `npm test -- src/tools/survey 'src/app/api/s/[token]/survey/images/[itemId]/route.test.ts' 'src/app/(app)/studies/[id]/actions.duplicate.test.ts' src/tools/battery`: 34 archivos, **409 pruebas correctas**. Incluye los seis formatos, conservación del archivo, subida/publicación, errores, validación real con sharp, copias independientes, rutas ajenas, liga inválida y reintento de visualización.
- `npm run typecheck`: correcto. `npx eslint` en el cuestionario, la ruta de imagen y las páginas/acciones afectadas: correcto; `git diff --check`: correcto.
- `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/tmp/cognia-font-mocks.cjs npm run build`: compilación de producción con Turbopack, TypeScript y generación de páginas correctas. Las fuentes de Google se simularon únicamente para la comprobación, porque no están disponibles por red; no hay cambios a la tipografía de producción.
- Chromium/Playwright local con Turbopack, en **1360×900 y 390×844**: subir una imagen local, describirla, cambiar entre los seis formatos conservándola, quitarla, mostrar seis imágenes en el participante, responder y llegar al agradecimiento. Sin desbordamiento horizontal ni errores JavaScript. Capturas temporales en `/tmp/cognia-survey-{editor,runner}-{1360,390}.png`; no son archivos de producto. La primera comprobación con webpack confirmó interacción, pero no estilos; se repitió satisfactoriamente con Turbopack y estilos reales. La pantalla temporal fue eliminada antes de compilar la entrega.
- Los clientes de base de datos/Storage de las pruebas son simulados; el procesamiento de imágenes sí usa sharp real. Sin prueba en Supabase real: faltan claves de investigador y servicio en el entorno. Se intentó una consulta de sólo lectura al proyecto configurado para comprobar bucket/políticas, pero el conector devolvió «You do not have permission to perform this action»; no se cambió la base de datos y su configuración remota continúa sin verificar.
- El navegador usa una pantalla temporal de prueba con componentes reales, respuestas de imagen simuladas y fuentes simuladas para evitar solicitudes externas; se elimina antes de la entrega. No certifica autenticación ni persistencia real.
- Una imagen opcional por pregunta propia; no se añade un formato de respuesta basado en archivos. No evalúa la imagen con IA: las opiniones las aportan los participantes.
- Si se cierra la pestaña durante la subida puede quedar un borrador remoto y sus archivos; se puede eliminar desde el proyecto. Tras un error normal la limpieza se intenta automáticamente. La selección local no se conserva después de cerrar o recargar la página.
- [PR #24](https://github.com/yveltal2026/neurofusion/pull/24) integrado en `main` (`f48f948`). El check Vercel del head `ab27024` terminó correctamente: [preview](https://vercel.com/neurofusion1/neurofusion/EY6SFjp9FkLPnT1xdybSNQVsWTiX). Despliegue de producción, prueba con Supabase real y adopción universitaria pendientes de verificar; ver `../ADOPCION.md`.

## Recuperación

Revertir los cambios de código y documentación del ID. Los campos opcionales no requieren revertir esquema, pero los clientes antiguos no mostrarán los adjuntos. Conservar los archivos si se prevé reactivar la función; eliminar un estudio desde esta versión limpia su carpeta privada. Revertir código no elimina los metadatos ni los objetos ya guardados.

## Historial de la ficha

- 2026-10-30: implementación sobre la versión actualizada de `main`; commit `73d2bfd` subido a `feat/survey-question-images` y [PR #24](https://github.com/yveltal2026/neurofusion/pull/24) abierto. Integración y despliegue pendientes.
- 2026-10-30: check Vercel del head `ab27024` correcto y PR #24 integrado por petición del propietario en `main`, merge `f48f948`. Producción y adopción universitaria sin verificar.
