# Análisis de imágenes por lote y predicciones por AOI

La mejora parte del `main` que incluye la marca v4.1. Los estudios de imágenes con IA muestran selección de piezas en su resumen; los journeys ofrecen **Analizar capturas en lote** para seleccionar capturas de distintos sitios/tareas. Los estudios de webcam conservan su protocolo de medición.

## Uso del lote

1. Seleccionar todas, sólo las imágenes sin analizar o piezas individuales.
2. **Analizar seleccionadas** envía una solicitud por imagen, en orden. Cada análisis se valida y guarda por separado; el límite de tiempo de una solicitud no se multiplica por el tamaño del lote.
3. Se muestran la imagen en curso, el progreso y el resultado de cada solicitud. Un fallo no borra éxitos anteriores ni evita continuar con las demás imágenes.
4. **Detener después de esta imagen** permite finalizar la solicitud activa y deja las siguientes en espera. Después se pueden seleccionar pendientes o fallidas para reintentar.
5. Mantener la página abierta mientras corre el lote. Salir de ella impide enviar nuevas solicitudes; la solicitud que ya está en el servidor puede terminar y guardar su resultado.

Se conserva el límite existente por estudio de 30 imágenes analizadas en la última hora y los límites de los proveedores. Cuando se informa una cuota agotada, el lote se detiene y muestra qué quedó pendiente. Elegir imágenes ya analizadas solicita una nueva lectura; las AOI revisadas por el analista se conservan.

## Informe por imagen

- **Aciertos principales:** hasta tres fortalezas respaldadas por la respuesta de IA; si una lectura antigua no tiene fortalezas, se usan criterios con puntuación ≥ 4 y su evidencia. Los demás aciertos originales siguen disponibles.
- **Debilidades principales:** hasta tres problemas priorizados por gravedad, con evidencia, elemento afectado y recomendación. Los criterios con puntuación ≤ 2 y las zonas importantes con saliencia baja aportan evidencia adicional, incluso en análisis antiguos. No se inventan defectos cuando no hay evidencia en el resultado guardado.
- **KPIs estimados por área de interés:** TTFF, FC, FD, TFD, dwell time, hit rate, primera fijación, visitas y regresos. Disponibles en el detalle y el informe imprimible, con exportación CSV que incluye identidad de la imagen.

## Qué significan los números de IA

**Son predicciones numéricas no medidas ni validadas con participantes.** El escenario común es una exposición hipotética de 5000 ms a un observador adulto típico del público declarado, sin búsqueda forzada. No hay un motor de eye tracking predictivo entrenado/calibrado ni una muestra detrás de estos valores.

Los tiempos y conteos describen un recorrido hipotético típico que observa cada área; las tasas son hipótesis poblacionales independientes. No son promedios observados ni probabilidades calibradas. Los resultados de AOI superpuestas no deben sumarse. La saliencia visual, los criterios de diseño y estas proyecciones son indicadores diferentes.

El modelo estima TTFF, FC, FD media, dwell, hit rate, primera fijación y visitas, además de explicar su fundamento visual. El programa deriva TFD = FC × FD y regresos = max(visitas − 1, 0). La validación requiere FC × FD ≤ dwell, TTFF + dwell ≤ 5000, 1 ≤ visitas ≤ FC y primera fijación ≤ hit rate. Sin fijaciones se exige TTFF/FD nulos y conteos/tasas en cero. Si la respuesta falla, se usa el reintento de corrección existente y no se sobrescriben resultados con una respuesta inválida.

Se guarda `predictionContext` con `source=ai_prediction_unvalidated`, `version=ai-eye-scenario-v1` y `exposureMs=5000`. La lectura se identifica como `nf-vision-1.3`. El CSV conserva la procedencia, versión y escenario, además del estado de cada fila. No elimina la advertencia al exportar los números.

Los análisis anteriores siguen siendo legibles y no reciben valores inventados: hay que volver a analizarlos para obtener predicciones nuevas. Si una AOI cambia de caja, tipo o identificador respecto a la lectura de IA, sus números se dejan vacíos; no se trasladan a una región distinta. Las mediciones reales de webcam siguen mostrándose en su herramienta propia y no se mezclan con estas hipótesis.

No se necesitan migraciones: se amplía el JSON del análisis de forma compatible. La cascada de proveedores, la autorización/RLS y el almacenamiento de cada imagen se reutilizan. La verificación automatizada usa un proveedor simulado para comprobar el contrato, la corrección de respuestas y la persistencia; la calidad predictiva requiere validación empírica independiente.
