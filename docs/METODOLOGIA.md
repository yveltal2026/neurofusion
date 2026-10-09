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
