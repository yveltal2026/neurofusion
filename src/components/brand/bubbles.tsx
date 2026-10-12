/**
 * Burbujas sueltas, nivel de efervescencia 1 («serena»): tres círculos perfectos de color plano,
 * en proporción 1 · 0.7 · 0.5, que suben de abajo a la izquierda hacia arriba a la derecha y se
 * hacen más pequeñas al subir. Color de la familia Neuro. Son decorativas: nunca tapan texto.
 */
export function Bubbles({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className}>
      <circle cx="26" cy="74" r="20" className="fill-neuro" />
      <circle cx="56" cy="44" r="14" className="fill-neuro-soft" />
      <circle cx="78" cy="22" r="10" className="fill-neuro-soft" />
    </svg>
  );
}

/**
 * Patrón «Resonancia» de la familia Neuro (anillos de burbujas que se abren desde un centro).
 * Solo como protagonista de una portada, con espacio libre alrededor: nunca detrás de texto.
 */
export function ResonanceMotif({ className = "" }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático decorativo */}
      <img src="/brand/motivo_claro.svg" alt="" aria-hidden="true" className={`dark:hidden ${className}`} />
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático decorativo */}
      <img src="/brand/motivo_profundo.svg" alt="" aria-hidden="true" className={`hidden dark:block ${className}`} />
    </>
  );
}
