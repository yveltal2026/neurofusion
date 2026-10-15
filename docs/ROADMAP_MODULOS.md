# Roadmap de módulos

Fecha: 2026-10-14 · Estado: **propuesta para revisión, con cuatro decisiones de producto ya tomadas** (§6). Las prioridades siguen siendo un juicio de análisis, no una decisión aprobada. Parte del estado de `main` y de [`EYETRACKING-DECISION.md`](EYETRACKING-DECISION.md); al escribirlo no existía aún código de eye tracking, así que lo que se dice de él es lo que ese documento promete.

## 1. Diagnóstico

| Capa | Hoy | Tipo de evidencia |
|---|---|---|
| Implícita | IAT | Medida, con participantes reales |
| Atención | Mapa de atención con IA (herramienta Visual) | **Estimada** |
| Atención | Eye tracking con webcam (spike pendiente) | **Medida**, pero sólo a nivel de bloque (error esperado 4–6°) |
| Conducta digital | Journey e IFD | **Modelada** (panel simulado de 5 000 perfiles) |
| Presencia digital | Auditoría SEO | Verificable |

Tres vacíos:

1. **No hay capa explícita.** Sin autorreporte no se puede contrastar lo que la gente dice con su respuesta implícita y su mirada.
2. **Mucho es estimado o simulado.** El mapa de atención y el IFD son modelos. Con participantes reales se pueden validar y calibrar.
3. **Hay herramientas, no un flujo de laboratorio.** Cada estudio es una sola herramienta con su liga mágica. No se puede componer una sesión (consentimiento → encuesta → IAT → eye tracking → cierre) ni existe un informe que cruce las capas.

## 2. Principios que todo módulo nuevo conserva

Son los del README y de [`HERRAMIENTAS_SEO_VISUAL.md`](HERRAMIENTAS_SEO_VISUAL.md):

1. Lo calculable es **motor puro, versionado y con pruebas**; la IA nunca recalcula cifras ni recibe filas crudas ni datos personales.
2. **El servidor no confía en el cliente**: regenera el plan, valida lo recibido y recalcula.
3. **Privacidad por defecto**: sin nombre ni correo, IP sólo como HMAC, el video nunca sale del dispositivo.
4. **Honestidad en la interfaz**: cada resultado dice si es medido, estimado o modelado, con su incertidumbre.
5. **Versionado inmutable** de cada medición.
6. Encaja en `src/tools/registry.ts` (`ToolType`) con el patrón `engine/` + runner cliente + servidor que valida.

## 3. Módulos, ponderados

Valor, esfuerzo y sinergia son estimaciones cualitativas (alto/medio/bajo), no mediciones.

| # | Módulo | Valor | Esfuerzo | Sinergia | Ola |
|---|---|---|---|---|---|
| 1 | Compositor de sesión + informe integrado de proyecto | Muy alto | Medio | Todas | 1 |
| 2 | Encuestas y escalas validadas | Muy alto | Bajo | IAT, eye tracking | 1 |
| 3 | Eye tracking: métricas de AOI y mapas agregados (continúa el spike) | Alto | Medio | Visual, pruebas de estímulos | 1 |
| 4 | Pruebas de estímulos (5 segundos, primer clic, preferencia, A/B) | Alto | Bajo–medio | Visual, eye tracking | 2 |
| 5 | Variantes del IAT (SC-IAT, Go/No-Go, priming afectivo) | Medio–alto | Bajo | Motor IAT | 2 |
| 6 | Precio (Van Westendorp, Gabor-Granger; luego MaxDiff y conjoint) | Alto | Bajo (los dos primeros) | Encuestas | 2 |
| 7 | Usabilidad real (tareas, card sorting, tree testing) | Alto | Medio | Journey/IFD | 3 |
| 8 | Voz del cliente (cualitativo con IA) | Medio–alto | Medio | Encuestas | 3 |
| 9a | Uso académico (rol de alumno, plantillas, duplicado, calculadora de muestra) | Alto (hoy) | Bajo–medio | Todas | 2 |
| 9b | Operación para clientes finales (portal de sólo lectura, cuotas, screeners, paneles externos, infraestructura) | Medio | Medio | Todas | 3 |
| 10 | Biometría importada (GSR, FC, EEG por CSV) | Medio | Medio | Compositor | 4 |
| 11 | Escucha de reseñas y redes | Medio | Alto | IFD | 4, bajo demanda |

**Fuera de alcance, por decisión metodológica:** codificación facial de emociones y pupilometría por webcam (validez débil con webcam y datos biométricos; para emoción se usa autorreporte tipo SAM y tiempos de reacción) y clientes o citas sintéticas (ya descartadas en Visual).

## 4. Ficha por módulo

Para cada uno: qué es, datos que guarda, cómo se sabe que está terminado.

### 1. Compositor de sesión + informe integrado

- **Qué es.** Un estudio pasa a ser una *batería*: lista ordenada de módulos que un participante recorre con una sola liga (consentimiento → datos → módulos → cierre). Hoy `studies` es de una herramienta; el compositor agrega el concepto de *pasos* sin romper los estudios existentes. **Decisión tomada:** el compositor **convive** con el estudio de una sola herramienta y el usuario elige entre ambos al crear el estudio (no se fuerza a nadie a pasar por la batería ni se migran los estudios existentes). Consentimiento de cámara y calibración son pasos reutilizables, no parte del módulo de eye tracking.
- **Informe integrado.** Una vista por proyecto que cruza implícito, explícito, mirada, visual y SEO sobre el mismo objeto de estudio. La IA redacta sobre agregados ya calculados, con la etiqueta medido/estimado/modelado por cifra.
- **Datos.** Tabla de pasos por estudio (tipo, orden, configuración versionada) y estado por sesión y paso. Campo común de **calidad de sesión** (validez IAT, calibración de mirada, tiempo de atención) para ponderar o excluir.
- **Listo cuando.** La pantalla de nuevo estudio ofrece ambas opciones («una herramienta» o «batería») y la primera se comporta exactamente como hoy; una batería de 3 pasos se completa de punta a punta en escritorio y celular; el servidor rechaza pasos fuera de orden; un estudio IAT existente sigue funcionando sin migrar datos; el informe integrado muestra al menos dos capas con su etiqueta de evidencia.
- **Riesgo.** Es el cambio estructural más grande; conviene diseñarlo antes de añadir más herramientas sueltas.

### 2. Encuestas y escalas validadas

- **Qué es.** Constructor de cuestionarios con tipos ya existentes (texto, número, opción única/múltiple, Likert) más matrices, ranking, deslizadores y una **biblioteca de instrumentos**: NPS, SUS, intención de compra, actitud hacia la marca/anuncio y SAM (valencia y activación). Cada instrumento con su fuente, puntuación y versión.
- **Datos.** Respuestas por sesión y pregunta; puntuaciones calculadas por el motor, no por el cliente.
- **Listo cuando.** SUS y NPS reproducen los valores publicados con casos de prueba; exportación CSV; se pueden usar como paso de una batería y como cuestionario previo/posterior al IAT.
- **Valor clave.** Permite la triangulación implícito vs. explícito, que es el núcleo del neuromarketing.

### 3. Eye tracking: AOI y mapas agregados

- **Qué es.** Continuación del spike. Una vez aprobada la puerta de validación (§6 de `EYETRACKING-DECISION.md`): estímulos con AOI, runner con consentimiento y calibración, **motor puro** de fijaciones y métricas de AOI (tiempo al primer vistazo, permanencia, número de visitas, orden), mapas de calor agregados con intervalo de incertidumbre.
- **Datos.** Sólo coordenadas normalizadas y marcas de tiempo, más calidad de calibración por sesión. Nunca video.
- **Restricción de diseño.** Con 4–6° de error, los AOI son **bloques grandes**; la interfaz debe impedir o advertir AOI más pequeños que el error esperado.
- **Listo cuando.** El motor tiene pruebas con trazas sintéticas; las sesiones con mala calibración se marcan y se excluyen del agregado por regla explícita; el informe declara el error esperado.
- **Validación cruzada (alto valor).** Comparar el mapa de atención estimado por IA (`nf-vision-1.0`) contra la mirada real de las mismas piezas y reportar la correlación. Convierte «estimación experta» en un modelo con evidencia, o muestra dónde falla. Ojo: esto compara dos estimaciones entre sí; **no sustituye** una validación contra un rastreador de laboratorio.
- **Sin presupuesto para validación externa (decisión tomada).** Mientras no la haya, el módulo se presenta como **indicativo, no validado contra un rastreador de laboratorio**, y esa leyenda va en la interfaz, en los informes y en cualquier material comercial. Lo que sí se hace sin costo:
  - medir el **error propio de cada sesión** con los puntos de validación tras calibrar (error interno, no independiente) y publicar internamente la distribución por dispositivo;
  - aplicar el criterio de salida del spike (≤ ~4° laptop, ≤ ~6° celular, ≥ 15 fps, Safari iOS) con las propias pruebas del equipo;
  - **no prometer a clientes finales** precisión que sólo existe en el paper de WebEyeTrack;
  - dejar abierta una alianza académica (una escuela con rastreador de laboratorio) como vía barata de validación posterior.

### 4. Pruebas de estímulos

- **Qué es.** Cuatro formatos sobre la biblioteca de `visual_assets`: **5 segundos** (exposición breve, luego recuerdo y comprensión), **primer clic** (dónde haría clic para lograr X), **preferencia** (pares, ranking) y **A/B** monádico o secuencial con asignación aleatoria balanceada.
- **Datos.** Clic en coordenadas normalizadas, tiempo, elección y orden de presentación (que fija el servidor).
- **Listo cuando.** Los mapas de clics se agregan por pieza; el A/B reporta diferencia con intervalo y tamaño de efecto; la asignación es reproducible desde una semilla.
- **Nota.** Las respuestas abiertas alimentan el módulo 8.

### 5. Variantes del IAT

- **Qué es.** SC-IAT (una sola marca), Go/No-Go y priming afectivo, reutilizando `src/tools/iat/engine`. Cada variante lleva su algoritmo de puntuación y su referencia.
- **Listo cuando.** Casos de prueba contra ejemplos publicados; el wizard solo ofrece la variante adecuada al número de conceptos; el análisis conserva las advertencias de validez.
- **Estado.** Construido de punta a punta (wizard, corredor, API con plan regenerado por el servidor, almacenamiento, resultados con advertencias y CSV; ver `docs/METODOLOGIA.md`). Cumplido: el wizard solo ofrece la variante que admite el número de conceptos y el análisis conserva y explica las advertencias de validez. **Pendiente: cotejar las puntuaciones y los parámetros contra conjuntos de datos publicados**; hoy las pruebas usan ejemplos calculados a mano.

### 6. Precio

- **Qué es.** Primero Van Westendorp (cuatro preguntas, curvas e intersecciones) y Gabor-Granger (curva de demanda e ingreso esperado). Después MaxDiff y conjoint por elección, que son más caros de diseñar y analizar.
- **Listo cuando.** Las intersecciones y la curva coinciden con ejemplos de manual; el informe aclara que la intención declarada sobreestima la compra real y no se presenta como pronóstico de ventas.

### 7. Usabilidad real

- **Qué es.** Tareas sobre capturas o prototipos con éxito, tiempo y ruta de clics; **card sorting** (abierto/cerrado) y **tree testing** para la arquitectura de navegación.
- **Relación con el IFD.** Permite sustituir o contrastar el éxito *modelado* con éxito *medido* en el mismo sitio, y recalibrar los pesos provisionales de `nf-journey-1.0` (pendiente 3 de `HERRAMIENTAS_SEO_VISUAL.md`).
- **Listo cuando.** Un journey existente puede ejecutarse con participantes reales y mostrar lado a lado IFD modelado y tasa de éxito observada.

### 8. Voz del cliente

- **Qué es.** Importar respuestas abiertas y transcripciones de entrevistas; la IA propone códigos y temas con citas verbatim *reales*, el analista los edita y aprueba (checkpoint humano, como las AOI). Conteos y frecuencias por tema los calcula el código.
- **Privacidad.** Detección y enmascaramiento de datos personales antes de enviar texto a la IA; política de retención.
- **Listo cuando.** Cada tema enlaza a las citas de origen; nada se publica sin aprobación del analista.

### 9a. Uso académico (prioridad actual: pruebas con escuelas)

- **Rol de alumno** dentro de una organización/curso, con permisos acotados (pendiente 4 de `HERRAMIENTAS_SEO_VISUAL.md`; hoy: analistas, una organización por usuario).
- **Plantillas de estudio** y duplicado entre proyectos, para que un docente prepare un estudio base y cada equipo lo copie.
- **Calculadora de tamaño de muestra** por herramienta, con una guía honesta de qué se puede concluir con grupos chicos (incluida la estabilidad de mapas de calor por mitades de muestra).
- **Aula**: ya existe el aviso de duplicados por IP+navegador que no bloquea (muchos comparten IP en un salón); hay que probar ligas con 20–40 dispositivos simultáneos y el límite de peticiones en memoria.
- **Requisitos legales previos a abrir ligas en escuelas** (ver [`ANALISIS_LEGAL_EYETRACKING.md`](ANALISIS_LEGAL_EYETRACKING.md)): aviso de privacidad, definición de roles y convenio con la escuela, corrección del texto «anónima», voluntariedad real frente al docente. No hay menores de edad en el alcance.

### 9b. Operación para clientes finales (cuando lleguen)

- **Portal de cliente de sólo lectura.**
- **Cuotas y screeners** con descalificación y cierre por celda.
- **Paneles externos**: parámetros de ID y URL de retorno al completar/descalificar.
- **Infraestructura**: limitador de peticiones compartido (hoy en memoria por instancia), bitácora de auditoría, retención y borrado de datos.

### 10. Biometría importada

- **Qué es.** Cargar CSV de sensores externos (GSR, frecuencia cardíaca, EEG) y alinearlos por marcas de tiempo con los eventos de la sesión (inicio de estímulo, respuesta). Sin captura propia: el hardware lo opera el laboratorio.
- **Listo cuando.** La sincronización se verifica con una señal de prueba y el informe declara el desfase tolerado.

### 11. Escucha de reseñas y redes

- **Condición.** Sólo con un cliente que lo pida y tras revisar términos de uso de cada fuente; preferir APIs oficiales o importación de archivos sobre scraping. Alimentaría las fricciones de reseñas del IFD.

## 5. Orden propuesto

- **Ola 1 — base:** compositor de sesión, encuestas y métricas de AOI de eye tracking. El spike debe dejar consentimiento y calibración como piezas reutilizables.
- **Ola 2 — estudio de concepto completo y uso en escuelas:** pruebas de estímulos, variantes del IAT, precio y uso académico (9a). Con la Ola 1 ya hay percepción, preferencia, atención y precio en una sola batería, y las escuelas pueden operar con rol de alumno y plantillas.
- **Ola 3 — profundidad y escala:** usabilidad real, voz del cliente y operación para clientes finales (9b).
- **Ola 4 — según demanda:** biometría importada y escucha de redes.

## 6. Decisiones tomadas (2026-10-14)

1. **El compositor convive con el estudio de una sola herramienta.** El usuario elige entre ambos al crear el estudio. Implicación de diseño: el estudio de una herramienta no se convierte en una «batería de un paso» por debajo si eso arriesga cambiar su comportamiento; si se unifica el modelo de datos, debe ser invisible para el usuario y cubierto por las pruebas actuales.
2. **Se probará ahora con escuelas y, quizá, con clientes finales.** El uso académico (9a) sube a la Ola 2 y la operación para clientes finales (9b) queda en la Ola 3, a activarse si el interés de clientes se confirma. El portal de sólo lectura no es bloqueante para las escuelas.
3. **No hay presupuesto para validar el eye tracking contra un rastreador de laboratorio.** El módulo sale etiquetado como indicativo y no validado (ver ficha 3); no se hacen afirmaciones de precisión a clientes. Se revisa si aparece una alianza académica o presupuesto.
4. **Revisión legal en dos pasos:** primero un análisis de cumplimiento con las herramientas legales de Claude (skill `legal:compliance-check` y, para clasificar riesgos, `legal:legal-risk-assessment`), y después validación por el equipo legal de FRSKO. **Ninguna liga con cámara/mirada se abre a participantes reales sin esa validación.** El análisis de Claude es un insumo para el equipo legal, no asesoría legal. **Primer paso hecho:** [`ANALISIS_LEGAL_EYETRACKING.md`](ANALISIS_LEGAL_EYETRACKING.md) (borrador pendiente de validación por legal).
5. **Todos los participantes serán de universidad o posgrado (mayores de 18).** No se diseña flujo para menores. Sigue siendo necesaria una casilla explícita de «tengo 18 años o más», porque el filtro es una autodeclaración y hay alumnos de primer semestre que pueden tener 17.

### Temas que el análisis legal debe cubrir (insumo)

- Consentimiento explícito de **cámara y mirada**, con la promesa técnica de que el video no sale del dispositivo y de qué datos sí se guardan (coordenadas, tiempos, calidad).
- **Autodeclaración de edad** (18 años o más) y voluntariedad real frente al docente; no hay menores en el alcance.
- Aviso de privacidad y base legal según la normativa mexicana de protección de datos personales vigente (confirmar la versión aplicable) y, si hubiera participantes de la UE, GDPR.
- Si los datos de mirada o el patrón de uso pueden considerarse biométricos o sensibles en alguna jurisdicción, y qué cambia si es así.
- Retención, borrado, derechos de acceso/rectificación/cancelación/oposición y cómo se ejercen sin identificar al participante.
- Responsabilidades entre FRSKO, la escuela y, en su caso, el cliente final (encargado vs. responsable del tratamiento).
- Uso de proveedores de IA: confirmar que sólo reciben agregados, sin datos personales.

## 7. Decisiones abiertas

1. ¿Qué escuelas y qué tamaño de grupo? Define si son públicas o privadas (régimen legal distinto) y la carga simultánea a probar.
2. ¿Quién es el responsable del tratamiento de los datos en las pruebas escolares: FRSKO, la escuela o el docente?
3. ¿Qué piezas del compositor se necesitan primero en las escuelas (¿encuesta + IAT, o ya con eye tracking?). Si el eye tracking no entra en las primeras pruebas, el trabajo legal más pesado puede esperar.
4. ¿Qué fecha tentativa tienen las primeras pruebas? Ordena el calendario de la Ola 1 y del trabajo legal.
