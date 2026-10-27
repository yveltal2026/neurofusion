const guide = [
  [
    "Time to First Fixation (TTFF)",
    "Tiempo hasta la primera fijación en un elemento.",
    "Comparar qué tan rápido se detecta la marca, el producto o el CTA.",
  ],
  [
    "Fixation Count (FC)",
    "Número de fijaciones sobre un elemento.",
    "Identificar áreas que concentran atención o requieren mayor exploración.",
  ],
  [
    "Fixation Duration (FD)",
    "Duración de cada fijación; la tabla muestra la media.",
    "Explorar profundidad de atención. Para evaluar esfuerzo cognitivo se necesitan medidas complementarias.",
  ],
  [
    "Total Fixation Duration (TFD)",
    "Tiempo acumulado de fijaciones en un área.",
    "Comparar cuánto tiempo de atención recibe cada elemento.",
  ],
  [
    "Dwell Time",
    "Tiempo de las visitas a un área, incluidos sus intervalos internos.",
    "Evaluar cuánto mantiene la atención una imagen, un producto o un mensaje.",
  ],
  [
    "Percentage of Viewers / AOI Hit Rate",
    "Porcentaje de sesiones con una fijación en el área.",
    "Saber cuántas participaciones detectaron el logotipo, precio, promoción o CTA.",
  ],
  [
    "First Fixation Percentage",
    "Porcentaje cuya primera fijación de la imagen cayó en el área.",
    "Identificar qué elemento domina la atención inicial.",
  ],
  [
    "Revisits / Revisit Count",
    "Número de regresos a un área tras abandonarla.",
    "Localizar nueva exploración o posibles dificultades de comprensión.",
  ],
  [
    "Visit Count",
    "Número de visitas visuales a una zona.",
    "Conocer la frecuencia de interacción visual con una sección.",
  ],
  [
    "Scanpath / Gaze Sequence",
    "Secuencia y recorrido de fijaciones por participante.",
    "Evaluar si la jerarquía visual guía la atención en el orden esperado.",
  ],
  [
    "Saccade Amplitude / Duration (aproximación)",
    "Distancia y tiempo entre fijaciones con señal continua.",
    "Analizar exploración y búsqueda visual. La webcam ofrece una aproximación entre fijaciones, sin resolver la sacada fisiológica.",
  ],
];

export function EyeKpiGuide() {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">
        Qué mide cada KPI y cómo aplicarlo
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className="p-2">
                Métrica / KPI
              </th>
              <th scope="col" className="p-2">
                Qué mide
              </th>
              <th scope="col" className="p-2">
                Aplicación en neuromarketing
              </th>
            </tr>
          </thead>
          <tbody>
            {guide.map(([name, measures, application]) => (
              <tr key={name} className="border-t border-border">
                <th scope="row" className="p-2">
                  {name}
                </th>
                <td className="p-2">{measures}</td>
                <td className="p-2">{application}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
