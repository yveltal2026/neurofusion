# Spike de eye tracking: guía de prueba

Rama: `spike/eyetracking` · Ruta: `/lab/eyetracking` · Decisión de origen: [`EYETRACKING-DECISION.md`](EYETRACKING-DECISION.md)

## Calibración actual: v5-weighted-refinement

V5 conserva las dos etapas y la validación independiente de v4. Pondera cada fijación con un peso entre 0.1 y 1 calculado a partir de muestras, proporción válida, dispersión y deriva. Los ajustes base y fino usan esos pesos; las fijaciones sin metadatos mantienen peso 1 para compatibilidad. Tras completar los puntos se revisan como máximo dos con peso inferior al 75 % de la mediana y menor de 0.35, una sola ronda. El JSON distingue los puntos aceptados (`clicks`, 9 o 18) del total de intentos, e incluye los índices revisados y reubicados (base cero).

Una fijación se considera saturada si al menos el 20 % de sus lecturas alcanza el límite 0 o 1 en algún eje. No entra en el ajuste: ese objetivo se mueve un 35 % hacia el centro en el eje afectado y se vuelve a capturar, con un máximo de dos desplazamientos por punto. Si persiste el problema se pide ajustar la cámara. La pantalla ofrece «Ajustar posición» para salir de una captura difícil. Los umbrales y pesos son decisiones operativas iniciales que requieren evaluación real.

### Deriva durante el uso

El botón «Comprobar deriva» del laboratorio mide tres fijaciones sin modificar el ajuste. Los estudios ejecutan ese control antes de presentar imágenes, cada dos piezas y al final. Se exige cobertura de los tres objetivos, al menos 15 lecturas/s, proporción válida ≥80 %, error mediano ≤4° en laptop o ≤6° en teléfono/tableta y error máximo ≤1.5 veces ese límite. Un fallo invalida las lecturas parciales y exige recalibrar; la nueva presentación reutiliza la sesión iniciada para no consumir otra plaza.

Los controles nunca entrenan el modelo ni cambian los coeficientes. El JSON del laboratorio incluye objetivos y lecturas medianas; el servidor del estudio guarda los resúmenes y recalcula su aceptación. Las sesiones creadas por el protocolo nuevo (`eye-v2`) requieren todos los controles en orden antes de completar. Las sesiones anteriores `eye-v1` y filas antiguas siguen siendo legibles. No hace falta cambiar el esquema SQL porque los datos adicionales se guardan en el JSON de calidad existente.

### Referencia de precisión

La sesión real `121` de v4 obtuvo 63.4 px y 2.14° de error mediano, frente a 126.8 px y 4.50° de la sesión `434`. En `121` se seleccionó 16:9 en lugar de 21:9: con el formato ultrawide anterior el cálculo angular sería aproximadamente 2.25°, manteniendo los mismos 63.4 px. Los ajustes globales adicionales probados retrospectivamente no redujeron la mediana. La prioridad de v5 es controlar fijaciones poco fiables y detectar pérdida de precisión durante los estudios. Los resultados de pruebas simuladas de v5 verifican la matemática y el flujo; su mejora real aún debe medirse.

## Antecedentes: v4-interior-refinement

La opción recomendada ejecuta dos etapas: nueve puntos para el ajuste afín base y nueve puntos interiores para aprender una corrección de escala y desplazamiento por eje. Los parámetros son propios de la persona y la sesión, sin valores fijados a partir de los JSON de prueba. Los ocho objetivos de validación final son distintos de los puntos de ajuste fino y no se usan para entrenar. La opción básica conserva sólo la primera etapa (`v4-stable-base`).

Después de cada clic se espera al menos 1 s y se busca una ventana de 800 ms con diez o más lecturas válidas, cobertura válida de al menos 80 %, antigüedad máxima de 200 ms y un tramo de al menos 500 ms entre primera y última lectura. Se rechazan ventanas con dispersión p90 por eje superior al 4 % del viewport o deriva entre primer y último tercio superior al 2.5 %. Tras unos 3 s sin ventana aceptable se pide repetir ese punto. Son filtros operativos iniciales; su idoneidad debe medirse en dispositivos reales. Una salida constante puede parecer estable: los ajustes también comprueban variación entre objetivos.

El JSON guarda las fijaciones por etapa, muestras, cobertura, dispersión, deriva y parámetros del ajuste base y fino. Permite distinguir una fijación poco estable de un fallo de escala. La validación final y sus umbrales de aceptación permanecen independientes de estas estadísticas de entrenamiento.

La sesión real `1212` de v3 mostró 7.89° de error mediano y ganancia horizontal de 1.369. En un análisis retrospectivo de ocho objetivos, una corrección por eje entrenada con siete y evaluada en el objetivo restante produjo 3.86° de error mediano. Esto motivó la segunda etapa, pero no demuestra precisión real de v4: se necesita una nueva sesión completa para comprobarla.

La sesión posterior `434`, todavía con v3, usó 18 clics y un viewport más estrecho (1767 × 939). Registró 4.50° de error mediano, ganancias de 1.194 y 1.133 y R² de 0.982 en ambos ejes. El mismo análisis retrospectivo por eje dio 2.33°; la corrección afín completa dio 2.53°. Esto respalda probar el ajuste fino por eje. La muestra sigue siendo una sola sesión de ocho objetivos; los valores retrospectivos no sustituyen una medición nueva de v4.

## Antecedentes: v3-affine-fixations

El archivo de una prueba real del 27 de octubre mostró ocho objetivos con mirada constante en la esquina superior derecha: error mediano 36.5°, 36 lecturas/s y dispersión cero. Esto confirma saturación de la salida, aunque el JSON por sí solo no identifica qué paso interno de la librería la produjo.

Desde v3 se bloquean los clics dirigidos al ajuste automático de WebEyeTrack y se conserva el modelo base. V3 mantenía cada objetivo 800 ms tras el clic y tomaba la mediana de las lecturas de los últimos 600 ms. Ajustaba una transformación afín regularizada usando las 9 o 18 fijaciones completas, detectaba entradas constantes o sin independencia entre ejes y validaba en los ocho puntos independientes. La transformación no recorta resultados a los bordes. No se permiten piezas de estudio si la validación falla.

Se pide diagonal en pulgadas y formato de la pantalla completa, con opciones ultrawide 21:9 y 32:9. El ancho físico se calcula con esa diagonal y la proporción seleccionada (o detectada con `screen.width/screen.height`), respetando orientación vertical. El tamaño físico sólo interviene en las métricas angulares; no arregla una predicción fija.

Las observaciones posteriores sobre `v2-corners-last` y los últimos seis clics describen el comportamiento histórico de la librería. Se necesita repetir la prueba real para medir el resultado de v3; las pruebas con simulador sólo verifican el flujo y la matemática.

Objetivo: medir, con personas y dispositivos reales, si WebEyeTrack cumple los criterios de salida (error mediano ≤ ~4° en laptop y ≤ ~6° en celular/tableta tras calibrar, ≥ 15 lecturas/s, funciona en Safari iOS) antes de construir el módulo. La página no guarda nada en servidor: cada sesión se descarga como JSON.

## Cómo probar

1. Abre la URL del **preview de Vercel de la rama** (`https://<preview>/lab/eyetracking`) en el dispositivo a probar. Necesita HTTPS (o `localhost`) para usar la cámara. Si el proyecto tiene *Deployment Protection* activa en previews, el celular pedirá iniciar sesión en Vercel o hará falta un enlace con bypass.
2. Completa: código de la persona (P01, P02… sin nombres), dispositivo, **diagonal física en pulgadas**, formato de pantalla (incluye ultrawide) y distancia aproximada a los ojos. Estos datos determinan la conversión de píxeles a grados.
3. «Iniciar cámara y cargar modelos» → acomoda la cara (el indicador debe decir «Cara detectada: sí») → «Comenzar calibración».
4. Calibración recomendada: 18 puntos en dos etapas. Mirar el punto y tocarlo cuando se ponga verde, sin dejar de mirarlo hasta que cambie. Si no hay fijación estable, se pide repetir ese punto. Cabeza quieta, dispositivo apoyado y sin girarlo.
5. Validación (automática, ~20 s): 8 puntos distintos a los de calibración. Solo mirar; **no tocar la pantalla**.
6. «Comprobar deriva» mide tres objetivos adicionales. «Descargar JSON» incluye los controles ejecutados. «Repetir validación» mide de nuevo sin entrenar; «Recalibrar» inicia un ajuste nuevo.

Cobertura sugerida: 5–10 personas repartidas en laptop, Android, iPhone/Safari y tableta; con y sin lentes; luz buena y mala. Anota el contexto en el código o en el nombre del archivo si hace falta (la iluminación y los lentes ya quedan en el JSON).

## Evaluar los resultados

Junta los JSON en una carpeta y corre:

```bash
npm run eyetracking:aggregate -- <carpeta>
```

Imprime, por dispositivo: sesiones, cuántas pasan, mediana de los errores medianos, peor sesión, lecturas/s y «CUMPLE / NO CUMPLE». Con menos de 5 sesiones por dispositivo es un indicio, no una conclusión. Los umbrales viven en `THRESHOLDS` (`src/lab/eyetracking/metrics.ts`); la tableta usa el criterio del celular por decisión provisional.

## Simulador (sin cámara)

`/lab/eyetracking?engine=fake` sustituye la cámara por el puntero (con un desvío fijo de 20 px y ruido de ±6 px). Sirve para ensayar el flujo y las exportaciones, y para pruebas automáticas; **no mide nada del eye tracking real**.

## Qué se midió y qué no (en el desarrollo del spike)

Verificado en Chromium headless con Next 16.4 (build de producción con Turbopack):

- La librería compila e importa sin configuración especial de worker, solo en cliente (import dinámico, `ssr: false`).
- El flujo completo (formulario → calibración de 9 clics → validación → resultados → JSON → agregador) con el simulador, incluida la vista de celular.
- El filtro de clics: de 12 clics emitidos, solo los 9 de los puntos de calibración llegan a `window` (donde los escucha la librería).
- Las métricas, con 31 pruebas unitarias.
- Errores claros ante cámara denegada o inexistente, modelo no servido y CDN bloqueado (el aviso sale en ~1 s).

**No verificado** (hay que probarlo en los dispositivos): el tracking real con cámara y cara, la precisión, los fps, Safari/iOS y el rendimiento en celulares. En el entorno de desarrollo el CDN `cdn.jsdelivr.net` estaba bloqueado por política de red, así que ahí no se pudo cargar MediaPipe.

## Primera medición real (P02 · monitor ultrawide 34″ · con lentes)

Archivo: `spike-data/P02-ultrawide34-lentes.json` (calibración `v1`, antes del cambio de orden).

| Dato | Valor | Lectura |
|---|---|---|
| Carga de modelos | 1.8 s · 25 lecturas/s · 99 % válidas · inferencia 34 ms | **La pila funciona de punta a punta** en Chrome/Windows |
| Error mediano | 10.2° (287 px = 9 cm) · p75 12.4° | No cumple el criterio de 4° |
| Eje horizontal | ganancia 0.95, R² 0.81, sesgo medio +141 px (≈ 4.4 cm a la derecha) | Sigue bien los movimientos; falla un desvío casi constante |
| Eje vertical | **ganancia 0.28**, R² 0.46 | Casi no distingue arriba de abajo (respuesta comprimida al 28 %) |
| Estabilidad | 85 px entre lecturas consecutivas (≈ 3°) | Mucho jitter |
| Área de prueba | 79 × 29 cm = ±38° × ±16° (laptop típica: ±17° horizontal) | Geometría extrema, pero no es la causa principal: la ganancia horizontal es ~1 aun a ±32° |

Interpretación (hipótesis, con n = 1): el problema dominante es el eje vertical y un desvío horizontal, compatibles con una calibración débil (≤ 6 muestras, orden que dejaba fuera las esquinas) y con factores propios de esa persona/equipo (lentes, ángulo y altura de la cámara). No permite concluir nada sobre WebEyeTrack en general.

## Si el error sale grande

Aísla una variable por vez y compara con el diagnóstico por eje de la pantalla de resultados:

1. **Misma persona, sin lentes** (o con lentes sin reflejo). El eje vertical es el que más sufre con armazón y reflejos.
2. **Reduce el área de prueba**: achica la ventana del navegador y céntrala frente a la cámara hasta que mida unos 35 cm de ancho (en un monitor de 80 cm / 2560 px, ≈ 1100 px). Si el error en grados baja a ~4°, el problema era la geometría; si no, no.
3. **Cámara a la altura de los ojos y centrada**, cara a ~50 cm, luz de frente. Una webcam muy arriba o desplazada empeora el eje vertical.
4. **Repite con el orden nuevo** (disposición `v2-corners-last`) y compara con la sesión anterior.
5. **Prueba en una laptop con su webcam integrada**: es la referencia que importa para decidir.

## Hallazgos de integración de `webeyetrack@0.0.2`

Salen de leer su bundle y de ejecutarlo; algunos contradicen lo que asumía la decisión inicial.

| Hallazgo | Consecuencia |
|---|---|
| El worker viene **incrustado** (Blob) en `dist/index.js`; `worker-loader` y la config de webpack solo son de su build | Sin riesgo de Turbopack: compila sin tocar `next.config.ts`. Riesgo descartado |
| Los **pesos del modelo no vienen en npm**. Se copiaron de `RedForestAI/WebEyeTrack@75fbd2f` (`js/examples/minimal-example/public/web`, 660 KB) a `public/web/` | La ruta `/web/model.json` está fija en la librería. Hay que versionar esos archivos y excluir `web/` del proxy de autenticación (hecho en `src/proxy.ts`) |
| La librería pide a terceros, sin opción de cambiarlo: WASM de MediaPipe a `cdn.jsdelivr.net` (versión 0.10.3, distinta de la del paquete) y `face_landmarker.task` a `storage.googleapis.com`, con `delegate: "GPU"` | Dependencia de red externa y de dos CDN (el video no sale, pero sí hay peticiones a terceros). Autoalojarlos exige parchear o forkear. Hay un chequeo previo que avisa si la red los bloquea |
| **La «personalización» es casi solo un ajuste afín sobre las últimas ~6 muestras.** `pruneCalibData` conserva `maxPoints = 5` y, tras cada clic, `adapt` da **un** paso de Adam con tasa 1e-5 (prácticamente nulo) y reajusta una matriz afín 2×3 con lo que queda | Más puntos de calibración no ayudan: solo pesan los últimos. El orden se diseñó para que terminen en las 4 esquinas + centro (`calibrationGrid`, disposición `v2-corners-last`). Lo de «≤ 9 muestras» del paper no se refleja en este código |
| **La calibración es por clic global**: cada clic en la ventana, normalizado por `innerWidth/innerHeight`, es una muestra; ignora clics a menos de 1 s del anterior o a menos de 5 % de distancia | No hay API de calibración explícita. El spike filtra los clics para que solo cuenten los de los puntos. Las coordenadas son del viewport, no de la pantalla física |
| `WebcamClient` **no lanza error** si se deniega la cámara (solo `console.error`) | Se pide el permiso antes por separado para dar un mensaje útil |
| No hay forma de destruir el worker ni de quitar su listener de clics | Cada arranque añade otro; el spike reutiliza una sola instancia y solo apaga la cámara al salir. Para el módulo definitivo habrá que parchear o forkear |
| `npm-run-all` y `worker-loader` están en `dependencies` de la librería | Solo pesan en `node_modules`, no en el bundle del navegador |
| Mantenimiento: 0.0.2, sin releases etiquetadas, 62★ | Se mantiene el riesgo y la interfaz `GazeEngine` como salvaguarda |

Estas limitaciones (CDN fijo, clic global, sin destrucción) hacen más probable que el módulo final necesite un **fork parcheado** de WebEyeTrack o pasar al plan B; el spike sirve también para decidir eso con datos.
