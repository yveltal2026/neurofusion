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

## Variantes del IAT (motor de puntuación, sin runner todavía)

`src/tools/iat/engine/variants.ts` puntúa tres variantes. **Aún no hay runner, wizard ni API para ellas**: el runner actual es de cuatro categorías y bloques de dos teclas. Antes de ofrecerlas a participantes hacen falta (1) un runner con ventana de respuesta, (2) que el servidor regenere el plan y revise los tiempos como hace con el IAT, y (3) cotejar las constantes con las publicaciones. Las constantes son **parámetros configurables con valores de la literatura**, no una réplica validada; las pruebas verifican la aritmética con ejemplos calculados a mano, no contra conjuntos de datos publicados.

| Variante | Medida | Referencia | Parámetros por defecto |
|---|---|---|---|
| SC-IAT (un solo concepto) | D = (media con polo negativo − media con polo positivo) / DE de todas las latencias | Karpinski y Steinman (2006) | ventana 1500 ms; descarta < 350 ms; error → media de aciertos del bloque + 600 ms (Greenwald et al., 2003) |
| Go/No-Go (GNAT) | d′ = z(aciertos) − z(falsas alarmas), con corrección log-lineal | Nosek y Banaji (2001); Hautus (1995) | corrección log-lineal; d′ y criterio c |
| Priming afectivo | media incongruente − media congruente (ms), sólo aciertos | Fazio et al. (1986) | rango válido 200–2000 ms; mínimo 4 ensayos por condición |

Las tres conservan las advertencias de validez del IAT (tasa de error > 30 % y > 10 % de respuestas rápidas).

## Precio en encuestas (Van Westendorp y Gabor-Granger)

Disponibles como bloques de la encuesta («Precio: Van Westendorp» y «Precio: Gabor-Granger» en el constructor). Motor en `src/tools/survey/engine/price.ts`, con pruebas calculadas a mano.

- **Van Westendorp.** Cuatro preguntas (muy barato, ganga, caro, demasiado caro). Se excluyen las respuestas incoherentes (muy barato ≤ ganga ≤ caro ≤ demasiado caro). Puntos de corte: **PMC** = «muy barato» × «no es barato»; **OPP** = «muy barato» × «demasiado caro»; **IPP** = «no es barato» × «no es caro»; **PME** = «demasiado caro» × «no es caro». Los cruces se interpolan linealmente sobre la rejilla de precios reportados. Se advierte con menos de 30 respuestas válidas (se recomiendan 100 o más) y si el rango sale invertido (PMC > PME).
- **Gabor-Granger.** Sí o no a cada precio, mostrados de menor a mayor. Se excluyen las respuestas no monótonas (sí a un precio mayor y no a uno menor). Reporta demanda con intervalo de Wilson al 95 %, ingreso esperado por persona (precio × proporción) y el precio que lo maximiza entre los probados. Mostrar siempre en orden ascendente puede sesgar la curva (efecto de anclaje); aleatorizar el orden queda pendiente.
- **Honestidad.** Ambos miden intención declarada, que sobreestima la compra real. El informe lo dice y no lo presenta como pronóstico de ventas. Los resultados de precio todavía no se entregan a la IA que redacta conclusiones.

## Pruebas de estímulos (motor, sin runner todavía)

`src/tools/stimuli/engine.ts`: asignación reproducible por bloques permutados desde una semilla (balanceada y sin estado), comparación de dos proporciones (IC de Newcombe, z agrupada, h de Cohen), t de Welch (IC, d de Cohen y g de Hedges) y agregación de clics por rejilla o área de interés con intervalo de Wilson. **Faltan** el runner (5 segundos, primer clic, preferencia, A/B), su API y las pantallas del investigador; ver `docs/ROADMAP_MODULOS.md`, módulo 4.
