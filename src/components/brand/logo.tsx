import Image from "next/image";

// viewBox oficial de los SVG: 2200.6 × 938.8
const RATIO = 938.8 / 2200.6;
// Manual de marca, cap. 3: con la palabra de abajo no baja de 120 px de ancho en pantalla.
const MIN_WIDTH = 120;

/**
 * Logo oficial «frsko neuro». Siempre se usa el archivo del logo, nunca texto en una tipografía.
 * El modo claro lleva letras teal y el profundo letras crema; el cambio sigue prefers-color-scheme.
 */
export function Logo({ width = 140, className = "" }: { width?: number; className?: string }) {
  const w = Math.max(width, MIN_WIDTH);
  const h = Math.round(w * RATIO);
  return (
    <span className={`inline-flex ${className}`}>
      <Image src="/brand/frsko_neuro.svg" alt="frsko neuro" width={w} height={h} priority className="dark:hidden" />
      <Image
        src="/brand/frsko_neuro_fondo_oscuro.svg"
        alt="frsko neuro"
        width={w}
        height={h}
        priority
        className="hidden dark:block"
      />
    </span>
  );
}
