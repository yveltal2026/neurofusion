import Image from "next/image";

// Manual de marca v4.1, cap. 3 y 4: el logo toma la forma según su ancho en pantalla.
//   completo (con «neuro»)  desde 140 px
//   sin palabra de abajo    de 96 a 139 px
//   la s con su ola         por debajo de 96 px, nunca menos de 24 px
const VARIANTS = {
  full: { file: "frsko_neuro", ratio: 886.5 / 2075.9, min: 140, alt: "frsko neuro" },
  short: { file: "frsko_neuro_sin_palabra", ratio: 576.5 / 2075.9, min: 96, alt: "frsko" },
  ico: { file: "frsko_neuro_s_ola", ratio: 546 / 544, min: 24, alt: "frsko" },
} as const;

export type LogoVariant = keyof typeof VARIANTS;

function variantFor(width: number): LogoVariant {
  if (width >= VARIANTS.full.min) return "full";
  if (width >= VARIANTS.short.min) return "short";
  return "ico";
}

/**
 * Logo oficial «frsko neuro» con la ola en la s. Siempre se usa el archivo del logo, nunca texto en una tipografía.
 * `tone="auto"` sigue prefers-color-scheme (letras teal en claro, crema en profundo); `tone="deep"` fuerza la
 * versión para fondo teal (encabezados y portadas profundas).
 */
export function Logo({
  width = 140,
  tone = "auto",
  variant,
  className = "",
}: {
  width?: number;
  tone?: "auto" | "deep";
  variant?: LogoVariant;
  className?: string;
}) {
  const v = VARIANTS[variant ?? variantFor(width)];
  const w = Math.max(width, 24);
  const h = Math.round(w * v.ratio);
  const light = `/brand/${v.file}.svg`;
  const dark = `/brand/${v.file}_fondo_oscuro.svg`;
  if (tone === "deep") {
    return (
      <span className={`inline-flex ${className}`}>
        <Image src={dark} alt={v.alt} width={w} height={h} priority />
      </span>
    );
  }
  return (
    <span className={`inline-flex ${className}`}>
      <Image src={light} alt={v.alt} width={w} height={h} priority className="dark:hidden" />
      <Image src={dark} alt={v.alt} width={w} height={h} priority className="hidden dark:block" />
    </span>
  );
}
