# Metodología del módulo IAT

Esta nota describe qué implementa la plataforma y dónde se desvía (o concreta) respecto del protocolo de referencia, para que un estudio sea defendible y citable.

## Protocolo de bloques

**Clásico (7 bloques, 200 ensayos por dimensión)** — Greenwald, Nosek & Banaji (2003):

| Bloque | Función | Ensayos | Cuenta para D |
|---|---|---|---|
| 1 | Discriminación de conceptos (A / B) | 20 | No |
| 2 | Discriminación de atributos (polo + / −) | 20 | No |
| 3 | Combinada, práctica | 20 | Sí |
| 4 | Combinada, prueba (misma combinación) | 40 | Sí |
| 5 | Conceptos con lados invertidos | 40 | No |
| 6 | Combinada invertida, práctica | 20 | Sí |
| 7 | Combinada invertida, prueba | 40 | Sí |

**Demo (5 bloques):** sin bloques 1 y 2, 10 ensayos por bloque combinado. La especificación fuente no fija el tamaño del bloque 5 en la demo; se usan 20 ensayos. Se conserva la numeración 3–7 para que el cálculo sea idéntico.

**Contrabalanceo.** Por dimensión y sesión, 50/50, se decide qué combinación comparte tecla primero (A con el polo positivo o con el negativo). Los atributos no cambian de lado entre bloques; sólo se invierten los conceptos (bloques 5–7). El servidor decide el contrabalanceo y una semilla por dimensión (reproducibilidad y auditoría).

**Ensayos.** Categorías balanceadas dentro de cada bloque; en bloques combinados se alternan ensayos de concepto y de atributo; no se repite un estímulo de atributo de forma inmediata y no hay rachas de más de 3 de la misma categoría.

**Errores.** Una X roja aparece tras una respuesta incorrecta y el ensayo no avanza hasta corregir. El tiempo de reacción incluye el tiempo hasta la corrección (estilo Project Implicit).

## D-score

1. Se usan los bloques 3+4 y 6+7.
2. Se excluyen ensayos con RT > 10 000 ms.
3. Calidad insuficiente si > 10 % de los ensayos válidos tienen RT < 300 ms (se reporta; no se eliminan ensayos).
4. D = (M(6+7) − M(3+4)) / DE de todos los ensayos válidos de ambos conjuntos juntos (DE muestral, n − 1).
5. **Normalización del signo:** D > 0 significa que el Concepto A se asocia más que el B con el **polo positivo** de la dimensión, sin importar el orden aleatorio de esa sesión.

Los ensayos con error se incluyen con su RT (que ya contiene la corrección), sin penalización adicional.

**Interpretación de |D|:** < 0.15 sin preferencia clara · 0.15–0.35 leve · 0.35–0.65 moderada · > 0.65 fuerte (0.35 queda en «leve» y 0.65 en «moderada»).

> Esta implementación sigue la especificación simplificada de la skill (un solo D sobre 3+4 vs 6+7). El algoritmo mejorado original promedia además el D de los pares práctica (3 vs 6) y prueba (4 vs 7) y elimina sujetos con muchas respuestas < 300 ms; aquí esos casos se *marcan* como «⚠️ Revisar calidad» y quedan fuera del análisis por defecto, pero no se recalculan.

## Validez de datos (por dimensión)

- Tasa de error global (todos los bloques) > 30 % → advertencia.
- > 10 % de ensayos usados con RT < 300 ms → advertencia.
- D no calculable → advertencia.

Cada dimensión se muestra como «✓ Datos válidos» o «⚠️ Revisar calidad de datos». El análisis agregado omite por defecto las dimensiones con advertencia (se pueden incluir).

## Estadísticos agregados

Por dimensión (y un compuesto por participante = media de sus D utilizables): n, D medio, DE, error estándar, IC 95 % (t de Student), t de una muestra contra 0 (dos colas), d de Cohen (media/DE), distribución de fuerza y dirección, histograma, concordancia implícito/explícito y desgloses por dispositivo y variables categóricas (grupos con menos de 5 sesiones se suprimen).

**Concordancia implícito/explícito.** Dirección implícita = hacia A o B si |D| ≥ 0.15, si no «sin preferencia». *Consistente*: coinciden (o ambas neutras). *Disonante*: apuntan a marcas opuestas. *Parcial*: una de las dos es neutra. Presupone que el primer polo de la dimensión es el favorable.

## Dispositivos

Se admite teclado (E/I) y botones táctiles. El RT táctil se toma en `pointerdown` (no `click`) para evitar el retardo del clic. Los tiempos táctiles son más lentos y ruidosos; el D se estandariza por la DE, pero la plataforma registra el dispositivo, recomienda computadora y reporta los desgloses por dispositivo para que el investigador pueda evaluar el sesgo.

## Límites y ética

- Un IAT mide asociaciones promedio de un grupo, no diagnostica a individuos; no se deben extraer conclusiones causales.
- Con n pequeño los intervalos son amplios; la plataforma advierte con n < 30 (y < 10).
- Temas sensibles (política, salud…): documentar consentimiento informado y uso ético de datos. El consentimiento aceptado se versiona por sesión.
- La IA sólo redacta la interpretación a partir de agregados; las cifras oficiales son las de las tablas y gráficas.

## Variantes del IAT (SC-IAT, Go/No-Go, priming evaluativo)

Herramienta «Variantes del IAT» (`tool_type = iat_variant`). Motor de puntuación en `src/tools/iat/engine/variants.ts`; configuración, plan de ensayos y validación del servidor en `src/tools/variants/`. Los **parámetros son configurables en el wizard** y sus valores iniciales vienen de la literatura, pero **no se han cotejado contra los conjuntos de datos de las publicaciones originales**: las pruebas verifican la aritmética con ejemplos calculados a mano y el flujo completo cliente-servidor, no una réplica de resultados publicados. Cambiar los parámetros vuelve los resultados no comparables con los de otros estudios.

| Variante | Conceptos | Tarea | Medida principal | Referencia | Parámetros por defecto |
|---|---|---|---|---|---|
| SC-IAT | exactamente 1 | Dos teclas; el concepto comparte tecla con el polo positivo en un bloque y con el negativo en el otro. Ventana de respuesta; sin respuesta a tiempo cuenta como error | D = (media con polo negativo − media con polo positivo) / DE de todas las latencias usadas. D > 0: asociación más rápida con lo positivo | Karpinski y Steinman (2006) | ventana 1500 ms; 24 ensayos de práctica y 72 de prueba por emparejamiento; se descartan respuestas < 350 ms; un error se sustituye por la media de aciertos del bloque + 400 ms |
| Go/No-Go (GNAT) | 1 o 2 | Un bloque por combinación concepto + polo: responder («go») sólo a los estímulos de la combinación y abstenerse ante el resto. La palabra queda en pantalla hasta el plazo | d′ por bloque = z(aciertos) − z(falsas alarmas) con corrección log-lineal (Hautus, 1995). Con un concepto: d′(con positivo) − d′(con negativo). Con dos: ese contraste de A menos el de B | Nosek y Banaji (2001) | plazo 700 ms; 40 ensayos por bloque (mitad señal, mitad ruido); 8 de práctica por bloque |
| Priming evaluativo | 1 o 2 | Un prime (la marca o una cadena de control «XXXXXX») y, tras un blanco, una palabra buena o mala que se clasifica por su valencia | Sesgo del prime = media(RT a negativas) − media(RT a positivas), sólo aciertos. Efecto de la marca = sesgo(marca) − sesgo(control). Con dos conceptos: efecto A − efecto B | Fazio et al. (1986); Hermans et al. (2001) | prime 200 ms + blanco 100 ms (SOA 300 ms); tope de respuesta 2000 ms; 2 repeticiones de cada combinación; rango válido 200–2000 ms; mínimo 4 ensayos por celda |

**Por qué el priming no usa «congruencia».** El priming afectivo clásico (Fazio et al., 1986) usa primes de valencia conocida. La valencia de una marca es justo lo que se quiere medir, así que aquí se compara cómo cambia la ventaja de las palabras positivas tras la marca frente a un prime de control. Es una adaptación nuestra del paradigma, no una réplica de un protocolo publicado.

**Qué envía el navegador y qué decide el servidor.** El plan de ensayos (qué estímulo, en qué orden, qué tecla es la correcta, qué lado es el positivo) es una función pura de la configuración y del id de sesión. El navegador sólo envía la tecla pulsada y la latencia de cada ensayo, junto con la huella (hash) del plan; el servidor regenera el plan, rechaza lo que no coincide (cantidad, orden, tecla que no corresponde a la variante, tecla sin latencia, latencia mayor que el plazo + 250 ms de tolerancia por el temporizador del navegador) y calcula los aciertos y las puntuaciones. Nunca recibe estímulos, aciertos ni puntuaciones del cliente. Los ensayos de práctica se guardan pero no puntúan.

**Advertencias de calidad** (el participante queda fuera del promedio principal, se cuenta, se explica y sigue en el CSV; la vista de resultados muestra cómo cambiaría el promedio si se incluyera):
- `high_error_rate`: errores (y tiempos agotados) > 30 % de los ensayos de medición (mismo umbral que el IAT).
- `fast_responses`: SC-IAT, > 10 % de respuestas correctas < 350 ms; GNAT, > 10 % de respuestas «go» < 200 ms (anticipaciones; el 200 ms es un criterio propio).
- `insufficient_data`: no se pudo calcular (celdas con muy pocos ensayos, sin variación, tasas de 0 o 1 sin corrección).
- `low_discrimination` (sólo GNAT): d′ global < 0,5. **Criterio propio, no de la literatura**: señala al participante que responde casi al azar o siempre/nunca.

**Limitaciones.** Las latencias dependen del dispositivo y del navegador (temporizadores, tasa de refresco, táctil). Los tiempos de presentación del priming (200 ms) y los plazos del GNAT son más sensibles que los del IAT clásico; se recomienda computadora con teclado y el wizard lo avisa. Una sola medición implícita no basta para una conclusión sobre una marca.

## Precio en encuestas (Van Westendorp y Gabor-Granger)

Disponibles como bloques de la encuesta («Precio: Van Westendorp» y «Precio: Gabor-Granger» en el constructor). Motor en `src/tools/survey/engine/price.ts`, con pruebas calculadas a mano.

- **Van Westendorp.** Cuatro preguntas (muy barato, ganga, caro, demasiado caro). Se excluyen las respuestas incoherentes (muy barato ≤ ganga ≤ caro ≤ demasiado caro). Puntos de corte: **PMC** = «muy barato» × «no es barato»; **OPP** = «muy barato» × «demasiado caro»; **IPP** = «no es barato» × «no es caro»; **PME** = «demasiado caro» × «no es caro». Los cruces se interpolan linealmente sobre la rejilla de precios reportados. Se advierte con menos de 30 respuestas válidas (se recomiendan 100 o más) y si el rango sale invertido (PMC > PME).
- **Gabor-Granger.** Sí o no a cada precio, mostrados de menor a mayor. Se excluyen las respuestas no monótonas (sí a un precio mayor y no a uno menor). Reporta demanda con intervalo de Wilson al 95 %, ingreso esperado por persona (precio × proporción) y el precio que lo maximiza entre los probados. Mostrar siempre en orden ascendente puede sesgar la curva (efecto de anclaje); aleatorizar el orden queda pendiente.
- **Honestidad.** Ambos miden intención declarada, que sobreestima la compra real. El informe lo dice y no lo presenta como pronóstico de ventas. Los resultados de precio todavía no se entregan a la IA que redacta conclusiones.

## Pruebas de estímulos (motor, sin runner todavía)

`src/tools/stimuli/engine.ts`: asignación reproducible por bloques permutados desde una semilla (balanceada y sin estado), comparación de dos proporciones (IC de Newcombe, z agrupada, h de Cohen), t de Welch (IC, d de Cohen y g de Hedges) y agregación de clics por rejilla o área de interés con intervalo de Wilson. **Faltan** el runner (5 segundos, primer clic, preferencia, A/B), su API y las pantallas del investigador; ver `docs/ROADMAP_MODULOS.md`, módulo 4.
