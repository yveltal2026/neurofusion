# Diagnóstico SEO por página

La ampliación `nf-seo-1.1` / `seo-score-1.1` conserva el rastreo acotado (hasta 25 páginas), el modo HTML subido y los controles de red existentes. No necesita migraciones: contexto y cobertura se guardan en los JSON de cada auditoría. Las auditorías anteriores conservan sus resultados originales.

## Configuración y contexto

- Hasta 25 objetivos por URL: palabra clave, objetivo editorial/comercial y visibilidad deseada (indexable o exclusión con `noindex`). Las URLs deben pertenecer al sitio auditado y no repetirse.
- Se priorizan estos objetivos tras la URL principal, dentro del límite total de páginas; no se promete revisarlos todos si se agota el tiempo o el límite.
- Las páginas sin objetivo propio usan la palabra clave general. Un objetivo propio con palabra vacía desactiva esa coincidencia literal en esa página.
- La coincidencia de URL elimina fragmentos, conserva parámetros y distingue la barra final. Los objetivos y su palabra efectiva se guardan con el resultado. Un plan de IA posterior usa ese contexto histórico, no los ajustes actuales.

## Diagnóstico y puntuación

El resumen muestra hasta tres aciertos y tres debilidades de reglas distintas, más sus acciones. Las fichas por URL muestran el contexto guardado, metadatos, evidencia y recomendaciones. Funcionan sin generar un plan con IA.

Las observaciones `advisory` son contextuales: no entran en el denominador ni restan puntos. Incluyen longitudes orientativas, varios H1, pocas palabras, coincidencia literal parcial de la palabra clave, ausencia de JSON-LD y canónicas alternativas cuya intención necesita revisión. Los conteos de hallazgos las incluyen; la interfaz y el CSV las identifican. Una auditoría sin evaluaciones puntuables muestra «—».

Una exclusión `noindex` intencional no se trata como un fallo y no se exige indexabilidad a su destino canónico. Si esa URL figura en el sitemap, se señala que debe retirarse de él. Si la URL debe excluirse y no se observa la directiva tras revisar HTML y cabeceras, se señala la discrepancia. En modo HTML subido, sin cabeceras revisadas, queda como observación contextual. No se afirma que una página esté indexada sólo por no detectar `noindex`.

## Comprobaciones adicionales

- Canónicas contradictorias en el HTML y destinos canónicos con HTTP 4xx/5xx, `noindex`, redirecciones o cadenas de canónicas observadas. Se resuelven URLs relativas respecto al documento final tras redirecciones.
- URLs del sitemap contrastadas con respuestas, HTML y bloqueos observados para Googlebot. No se consideran correctas ni erróneas las URLs no comprobadas.
- Reciprocidad `hreflang` entre documentos descargados. `x-default` es opcional.
- Campos básicos de JSON-LD: contexto heredado, `name` en Product/Organization/LocalBusiness, `headline` en Article/NewsArticle/BlogPosting y nombres/posiciones en BreadcrumbList. No es validación completa de schema.org ni prueba de elegibilidad para resultados enriquecidos; no inspecciona microdatos o RDFa.
- Duplicados y enlaces rotos/redirigidos se atribuyen a cada página de origen. Los fallos de red se distinguen de HTTP 4xx/5xx; una verificación parcial sin fallos conocidos no certifica todos los enlaces.

## Cobertura e historial

La cobertura muestra páginas con HTML, comprobaciones HTTP de páginas/destinos internos, URLs descubiertas y contrastadas del sitemap, omisiones por robots, estado de PageSpeed y motivo de finalización. No representa todo el sitio. Los sitemaps y robots tienen descargas propias que no se incluyen en el contador HTTP de páginas.

La comparación usa la auditoría inmediatamente anterior del mismo estudio y fecha anterior. Exige modo, URL principal, motor, versión de puntuación y objetivos compatibles. Si no existe contexto histórico, informa que no se puede comparar.

- **Nuevo:** una evaluación antes correcta ahora falla.
- **Resuelto:** una evaluación antes fallida ahora es correcta.
- **Persistente:** la misma evaluación sigue fallando.
- **Detectado por primera vez:** falla una evaluación sin antecedente comparable.
- **Sin verificar de nuevo:** el fallo anterior no tiene una evaluación actual concluyente.

Cambiar la muestra impide declarar resueltos los hallazgos globales y los duplicados entre páginas. El delta de puntuación exige las mismas URLs y evaluaciones puntuables. El gráfico del estudio usa sólo la serie reciente con alcance compatible y muestra hasta 50 auditorías. No se comparan puntuaciones de versiones distintas como si fueran una mejora del sitio.

## Límites

El rastreo no ejecuta JavaScript. PageSpeed sigue analizando la URL principal en un dispositivo elegido. No se añaden Search Console, volúmenes de búsqueda, posiciones, backlinks, renderizado de navegador ni promesas de tráfico. El plan con IA interpreta evidencia y propone textos para revisión humana; no modifica sitios externos.
