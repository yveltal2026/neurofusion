# KPIs de eye tracking

En **Resultados** de un estudio de webcam se pueden consultar las sesiones incluidas, seleccionar un participante y alternar entre heatmap (número o duración de fijaciones), gaze plot y áreas de interés. En el detalle de cada imagen se dibujan o editan hasta 30 AOI, sin ejecutar análisis de IA. Guardar las áreas recalcula los resultados sobre las lecturas originales. Los CSV de KPIs agregados, KPIs por participante y fijaciones se generan con las mismas funciones que usa la interfaz.

## Método `idt-image-v1`

Se detectan fijaciones con I-DT: mínimo 100 ms, dispersión de la caja envolvente ≤ 3.5 % de la diagonal de la imagen (corrigiendo su aspecto) y máximo 100 ms entre lecturas. Los timestamps repetidos interrumpen la continuidad. No se extrapola tiempo antes o después de las muestras. El centroide está ponderado por tiempo y se asigna a todas las AOI que lo contienen.

| KPI                          | Definición y agregado                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TTFF                         | Inicio de la primera fijación en la AOI desde que aparece la imagen. Media sólo entre sesiones que la fijaron; sin hits es nulo.                                           |
| Fixation Count               | Número de fijaciones en la AOI. Media por sesión, incluyendo ceros.                                                                                                        |
| Fixation Duration            | Duración individual en el CSV de fijaciones y en el scanpath. La tabla muestra su media agrupando todas las fijaciones de la AOI.                                          |
| Total Fixation Duration      | Suma de duraciones en la AOI. Media por sesión, incluyendo ceros.                                                                                                          |
| Dwell Time                   | Suma de los intervalos desde la primera hasta la última fijación de cada visita, incluidas las transiciones internas. Media por sesión, incluyendo ceros.                  |
| AOI Hit Rate                 | Sesiones con al menos una fijación en la AOI / sesiones con lecturas dentro de la imagen × 100.                                                                            |
| First Fixation Percentage    | Sesiones cuya primera fijación de toda la imagen cae en la AOI / misma base × 100.                                                                                         |
| Visit Count                  | Grupos de fijaciones en la AOI sin salidas ni cortes entre ellos. Media por sesión.                                                                                        |
| Revisits                     | Máximo de visitas menos una y cero. Media por sesión.                                                                                                                      |
| Scanpath                     | Secuencia de fijaciones de cada sesión, con inicio, duración, posición y AOI. Las trayectorias de distintas personas nunca se concatenan.                                  |
| Saccade Amplitude / Duration | Aproximación: distancia entre centroides en % de diagonal y tiempo entre fijaciones con señal continua. Media de las transiciones. No son medidas fisiológicas de sacadas. |

Se incluyen sólo sesiones con calibración aprobada, no limitadas y no excluidas por el investigador. Una sesión sin muestras en la imagen no entra en el denominador; una sesión con muestras pero sin fijaciones sí entra, con ceros. Se deduplica por ID de sesión en cada pieza. Los posibles duplicados entre sesiones se señalan para revisión manual. Las AOI superpuestas son independientes; las tasas pueden sumar más de 100 %.

El panel conserva el alcance de las 100 sesiones más recientes e informa si se alcanza ese límite. Sus CSV corresponden a esa misma selección de sesiones; la exportación de lecturas original recorre todas las sesiones e incluye sus banderas de calidad/exclusión. Los KPIs incluyen la versión del método en cada fila y el CSV agregado informa la base de sesiones. Se usa CSV con escape de fórmulas, comillas y UTF-8 con BOM.

Los heatmaps suman número o duración de fijaciones por tiempo de exposición, sin ponderar por FPS. La intensidad se normaliza al máximo de la selección: los colores muestran concentración relativa y no constituyen un KPI ni una escala absoluta comparable entre imágenes. El gaze plot agrega recorridos separados, con un color por sesión, orden numerado y tamaño según duración.

## Límites de los datos

La webcam y las lecturas guardadas (hasta 600 muestras distribuidas por exposición) permiten estimaciones exploratorias. Una señal baja, una AOI pequeña o el submuestreo afectan la detección. La amplitud no se convierte a grados porque no se guarda geometría física por imagen; el intervalo entre fijaciones no resuelve la duración fisiológica de una sacada. Ninguna duración implica por sí misma comprensión, emoción o esfuerzo cognitivo.

Pruebas: `npm test -- src/tools/visual/eye/metrics.test.ts` cubre secuencias conocidas, salidas breves, huecos de señal, aspecto de imagen, denominadores, solapamientos y ritmos de muestreo distintos.
