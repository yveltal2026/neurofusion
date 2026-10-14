import { Card } from "@/components/ui/card";
import type { IfdMeasurementRow } from "@/lib/db/types";
import type { SiteSummary } from "../journey/model";

/** Nota metodológica obligatoria (lo que se puede y no se puede afirmar). */
export function MethodNote({ measurement }: { measurement: IfdMeasurementRow }) {
  const s = measurement.summary as SiteSummary;
  return (
    <Card className="space-y-2 text-sm break-inside-avoid">
      <h3 className="font-medium">Cómo leer estos resultados</h3>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Es una <strong>estimación modelada</strong>, no una prueba con usuarios. El panel de {measurement.n_panel.toLocaleString("es-MX")} perfiles
          es sintético (calibración {measurement.calibration_version}) y transforma las calificaciones del analista; no aporta evidencia empírica nueva sobre
          el sitio.
        </li>
        <li>
          La evidencia verificable son las capturas fechadas y las observaciones citadas en cada calificación. El gráfico de sensibilidad muestra qué juicios
          pesan más.
        </li>
        <li>
          El ruido numérico de la simulación es de ±{s.simulationNoisePts} puntos en los porcentajes; <strong>no es un margen de error poblacional</strong>.
        </li>
        <li>
          Versiones: motor {measurement.engine_version} · {measurement.ifd_version} · {measurement.rubric_version} · semilla {measurement.seed}. No compares
          mediciones de versiones distintas sin anotarlo.
        </li>
      </ul>
    </Card>
  );
}
