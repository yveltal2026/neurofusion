# Herramientas 2 y 3: Auditoría SEO y Análisis visual con IA

Origen: el módulo **FRSKO NeuroSEO v1.0** (pipeline CLI en Python, desarrollado por separado) se dividió en dos herramientas y se portó a TypeScript dentro de NeuroFusion. Junto con el IAT, la plataforma queda con tres herramientas:

| Herramienta | Qué hace | Evidencia que produce |
|---|---|---|
| IAT | Asociaciones implícitas con participantes reales | Tiempos de reacción, D-score |
| **Auditoría SEO** | Rastreo, on-page, datos estructurados, enlaces, Core Web Vitals | Verificable: HTML, códigos HTTP, robots, sitemaps, PageSpeed |
| **Análisis visual** | Piezas gráficas y capturas web (modo **pieza**) + recorrido de compra con rúbrica e **IFD** (modo **journey**) | Mixta: métricas de imagen deterministas + lectura experta de IA revisada por el analista |


## Principios (heredados del IAT y de la postura metodológica de NeuroSEO)

1. **Lo calculable es código puro y probado** (`src/tools/seo/engine`, `src/tools/visual/engine`, `src/tools/visual/journey`). La IA nunca recalcula cifras.
2. **La IA redacta o propone; el analista decide.** El plan SEO se redacta sobre hallazgos ya calculados (nunca sobre HTML crudo). Las áreas de interés y las calificaciones de la rúbrica que propone la IA se revisan y guardan a mano (checkpoint humano).
3. **Honestidad en la interfaz.** Los mapas de atención dicen «estimación experta, no eye tracking». El IFD dice «estimación modelada»; el ruido de la simulación no se presenta como margen de error poblacional.
4. **Versionado.** Cada resultado guarda las versiones con que se calculó (`nf-seo-1.0`, `seo-score-1.0`, `nf-img-1.0`, `nf-vision-1.0`, `nf-journey-1.0`, `ifd-1.0`, calibración, rúbrica, semilla). Una medición vieja nunca se recalcula con una fórmula nueva: se vuelve a medir.

## Auditoría SEO

La ampliación actual usa `nf-seo-1.1` / `seo-score-1.1`: añade objetivos y diagnóstico por URL, cruces técnicos, cobertura y comparación histórica conservadora. Las observaciones contextuales no restan puntos. Ver [detalle y límites](SEO-DIAGNOSTICO.md); las auditorías anteriores conservan su versión y puntuación originales.

**Flujo:** el analista define el sitio una vez (URL, URLs adicionales, páginas a rastrear, palabra clave, dispositivo) y lo audita cuantas veces quiera. Cada auditoría queda guardada (gráfica de evolución de la puntuación).

**Modo en vivo** (`src/tools/seo/crawl.ts`): robots.txt → http→https → sitemaps (índices y `.xml.gz`, máx. 3+3) → rastreo acotado (≤ 25 páginas, respeta robots.txt, ~85 s de presupuesto) → verificación de hasta 30 destinos internos enlazados → PageSpeed Insights (en paralelo).

**Modo asistido**: el analista guarda el HTML desde su navegador y lo sube (sitios que bloquean centros de datos, frecuente en retail MX; Vercel también es centro de datos).

**Reglas** (`engine/rules-catalog.ts`): cada regla aplicable emite exactamente un hallazgo, CORRECTO incluido, así los conteos cuadran por construcción.

| Bloque | Revisa |
|---|---|
| Rastreo | robots accesible, Sitemap declarado, bloqueo total (Googlebot/Bingbot/*), sitemaps accesibles y frescura de `lastmod`, cadenas de redirección |
| Indexación | código HTTP, `noindex` en meta robots **y** en `X-Robots-Tag`, `nofollow`, canonical (ausente, vacía, relativa, a otra URL) |
| Contenido | título (ausente/corto/largo), meta description (ausente/corta/larga), palabra clave en título/H1/descripción, contenido escaso, títulos y descripciones duplicados |
| Estructura | H1 único, saltos de jerarquía |
| Datos estructurados | JSON-LD presente y válido, tipos incluyendo `@graph` |
| Social, internacional, móvil, imágenes, seguridad | Open Graph, `lang`, hreflang (autorreferencia, x-default, códigos), viewport, `alt`, contenido mixto, redirección a https |
| Enlaces | enlaces internos rotos y enlaces a redirecciones |
| Rendimiento | puntuación Lighthouse, LCP, CLS, INP con umbrales oficiales; prefiere datos de campo (CrUX p75) sobre laboratorio |

**Puntuación `seo-score-1.0`**: promedio ponderado por regla (peso 1–3) del crédito de cada evaluación (CORRECTO 1 · MEJORABLE 0.5 · GRAVE 0.25 · CRÍTICO 0). Sirve para seguir la evolución de un mismo sitio; no es una métrica de Google. Junto a ella se muestra la categoría SEO de Lighthouse (vía PageSpeed): ésa revisa sólo la página principal, ya renderizada con JavaScript y con ~10 comprobaciones básicas, así que suele salir más alta (p. ej. 100 vs. 60). No se contradicen: miden cosas distintas.

**URLs**: se comparan sin hash ni puerto por defecto, pero **conservando la barra final** (`/ia` y `/ia/` son URLs distintas; antes quitarla provocaba bucles de redirección falsos en sitios con barra final). Los bucles reales se reportan como «bucle de redirecciones». Si una página entrega casi nada en el HTML (< 50 palabras y sin enlaces internos), la auditoría avisa que el sitio parece construirse con JavaScript.

**Plan con IA**: resumen, prioridades con impacto/esfuerzo y pasos, ganancias rápidas y propuestas de reescritura de títulos/descripciones/H1 para revisión editorial. Exportación CSV e impresión a PDF.

**Seguridad**: protección SSRF en cada salto (sólo http/https públicos en 80/443; se rechazan localhost, rangos privados, metadatos de la nube y dominios que resuelven a IP privadas). Riesgo residual documentado: rebinding de DNS entre la validación y la conexión. Límites: 6 auditorías y 10 planes de IA por estudio y hora; HTML subido ≤ 1.5 MB por archivo y 3.5 MB en total.

## Análisis visual · modo pieza

1. **Subida** directa al bucket privado `study-assets` (Storage con RLS por organización). El servidor descarga cada archivo, verifica por contenido que sea PNG/JPEG/WebP, guarda su SHA-256 y calcula las métricas.
2. **Métricas deterministas** (`nf-img-1.0`): contraste RMS, saturación visual (densidad de bordes Sobel), espacio negativo, colorido (Hasler–Süsstrunk), paleta dominante, contraste WCAG estimado en las cajas de texto, y cumplimiento del formato (Meta, Google Display, YouTube, LinkedIn, capturas web: tamaño, proporción, peso).
3. **Lectura con IA de visión** (`nf-vision-1.3`): elementos con caja, atracción estimada (1–5), importancia para el objetivo (1–5), orden de lectura, seis criterios (claridad, jerarquía, acción, legibilidad, marca, carga visual) con evidencia, problemas con recomendación, fortalezas y límites. Añade hipótesis numéricas por AOI (TTFF, fijaciones, dwell, tasas y visitas) para 5 segundos de exposición, explícitamente no medidas ni validadas con personas. Las capturas largas se reducen y se cortan en franjas (máx. 4). El resumen admite selección y análisis por lote; método, límites y compatibilidad en [`ANALISIS_VISUAL_LOTES.md`](ANALISIS_VISUAL_LOTES.md).
4. **Áreas de interés (AOI)**: las propone la IA; el analista las corrige, agrega (arrastrando) o elimina y las marca como revisadas. Puede restaurar la propuesta de la IA.
5. **Capas** (dibujadas en el navegador, exportables a PNG): mapa de atención, recorrido visual y **zonas ciegas** (elementos importantes ≥ 4 con atracción ≤ 40 %).
6. **Comparativa** de variantes e **informe** imprimible con nota metodológica.

## Análisis visual · modo journey + IFD

1. **Diseño**: sitio principal + hasta 5 competidores, 1–8 tareas con **tipo** (búsqueda, resultados, ficha, carrito, categorías, otra) y panel modelado (cuotas de edad y alfabetización digital, calibración `cal-mx-2026.1`).
2. **Capturas** por sitio y tarea (modo asistido: el analista recorre el sitio con su navegador).
3. **Calificación con evidencia**: cada ítem de la rúbrica requiere justificación y, de preferencia, la captura que la respalda. La IA puede sugerir valores a partir de las capturas; el analista decide y queda registrado si partió de una sugerencia.
4. **IFD**: todos los sitios se simulan con el mismo panel y la misma semilla. Se guarda una medición inmutable por sitio con entradas y versiones, más **análisis de sensibilidad** (cuánto cambia el IFD si cada calificación sube o baja 0.1), desglose por segmento y alertas de coherencia.
5. **Re-medición**: duplica el diseño y la semilla sin capturas ni calificaciones (se califica de nuevo). La serie histórica del proyecto compara mediciones de la misma URL.

### Modelo `nf-journey-1.0`

Puerto de `simulate.py` + `benchmark.py`. Por sujeto: `ld` = alfabetización (Alta 2, Media 1, Baja 0), `e` = índice de edad (0–5).

```
p(tarea) = base_exito + coefLD(tipo)·ld − 0.03·e + Σ peso(tipo, fricción)·fricción     → clip [0.04, 0.97]
tiempo   = clip(N(40 + 12·idx − 6·ld, 12), 15, 200)
abandono = login ∧ falló carrito ∧ U < 0.75
confianza= clip(N(1.6 + 2.6·confianza_vendedor + 0.5·reseñas, 0.55), 1, 5)
SUS      = clip(N(37 + 5.2·k + 4·ld + 6·nav, 6), 20, 96)        k = éxitos reescalados a 5 tareas
carga    = clip(N(5.6 − 0.5·ld − 0.35·k − 1.0·nav, 0.7), 1, 7)
IFD      = 100 − (0.35·éxito + 0.25·SUS + 0.20·confianza/5·100 + 0.20·(100 − abandono))   [ifd-1.0, idéntico]
```

| Tipo de tarea | coefLD | Fricciones que suman |
|---|---|---|
| Búsqueda | 0.09 | relevancia_resultados × 0.05 |
| Resultados | 0.09 | resenas_visibles × 0.06 (original) |
| Ficha | 0.09 | claridad_ficha × 0.05 (original) |
| Carrito | 0.10 (original) | claridad_msi × 0.04 |
| Categorías | 0.09 | arquitectura_nav × 0.06 |
| Otra | 0.09 | — |

Los pesos de relevancia, MSI y navegación en categorías son **nuevos y provisionales** (antes esas fricciones se calificaban pero no influían: defecto D-07).

Diferencias con NeuroSEO, todas deliberadas:

- Panel de 5 000 perfiles (antes 80): el ruido de simulación cae a ±1.4 pts y se reporta como tal, no como margen de error poblacional.
- Números aleatorios comunes reales: cada sujeto consume siempre la misma cantidad de números (incluido el de abandono), así las diferencias entre sitios sólo reflejan las calificaciones.
- Género, NSE, ciudad, ocupación y frecuencia de compra se eliminaron del panel: eran descriptivos y no influían en nada.
- Verbatims sintéticos eliminados: presentar citas inventadas al cliente contradice la postura metodológica.
- RNG distinto (mulberry32 + Box–Muller): los valores exactos no coinciden con el motor Python; la fórmula del IFD sí. Con las calificaciones del demo, el IFD queda dentro de ±3 pts del original (prueba en `journey/model.test.ts`).

## Qué se reutilizó de NeuroSEO y qué no

| Pieza de NeuroSEO | Destino |
|---|---|
| `seo.py` (reglas) | Portado y ampliado (`src/tools/seo/engine`); corregidos D-04, D-17, D-18, D-19, `@graph`, `.xml.gz` |
| `attention.py` | Portado al navegador (sin jitter aleatorio, con umbral y desvanecimiento: D-14); las AOI ahora las propone la IA y las revisa el analista |
| `panel.py`, `simulate.py`, `benchmark.py` | Portados (`src/tools/visual/journey`); corregidos D-05, D-06, D-07 |
| `storage.py` + `manifest.json` | Sustituidos por tablas con RLS, SHA-256 completo y versiones por resultado (corrige D-01, D-08, D-12, D-20) |
| `capture.py` (Playwright) | No: el flujo productivo es el modo asistido; Vercel no corre Chromium |
| `pdf_report.py` (Chromium + Ghostscript), `xlsx_report.py` (LibreOffice) | No: informes imprimibles desde el navegador y CSV (corrige D-02, D-03, D-11, D-15) |
| Verbatims | No (ver arriba) |
| Portal de cliente (mockup) | Pendiente |

## Pendientes

1. **Integrar la rúbrica oficial** (`docs/RUBRICA_FRICCIONES.md` de NeuroSEO) en `src/tools/visual/journey/rubric.ts` → nueva `RUBRIC_VERSION`. Hoy las anclas son provisionales y la interfaz lo advierte.
2. Revisar `BLUEPRINT.md` cuando llegue (temas, portal, API del ecosistema).
3. Validar los pesos provisionales del modelo con el equipo metodológico.
4. Portal de cliente de sólo lectura y rol de alumno de maestría (hoy: analistas, una organización por usuario).
5. Captura automatizada (servicio externo) si se vuelve necesaria.
