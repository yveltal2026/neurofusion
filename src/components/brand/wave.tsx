import { useId } from "react";

// Manual de marca v4.1, cap. 11: entre una franja y otra, una onda suave (dos crestas por pantalla,
// nunca más; de cresta a valle no pasa del 13% de su largo). Es la misma ola del corte de la s.
const WAVE_BOTTOM = "M0 0H1200V54Q1050 4 900 54T600 54T300 54T0 54Z";

/**
 * Borde ondulado que cuelga de una franja profunda y baja hacia el contenido claro. Con `filo`, una
 * segunda onda en degradado de la familia Neuro asoma por debajo (el degradado sólo vive en bandas y
 * filos: nunca en texto, y es el único protagonista de la pieza).
 */
export function WaveEdge({ filo = true, className = "h-4" }: { filo?: boolean; className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden="true" focusable="false" className={`block w-full ${className}`}>
      {filo ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: "var(--neuro)" }} />
              <stop offset="1" style={{ stopColor: "var(--neuro-soft)" }} />
            </linearGradient>
          </defs>
          <path d={WAVE_BOTTOM} transform="translate(0 30)" fill={`url(#${id})`} />
        </>
      ) : null}
      <path d={WAVE_BOTTOM} className="fill-deep" />
    </svg>
  );
}
