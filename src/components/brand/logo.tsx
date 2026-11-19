import { BrandImage } from "./brand-image";

export type LogoVariant = "full" | "short" | "ico";

export function Logo({
  width = 140,
  tone = "auto",
  variant,
  decorative = false,
  className = "",
}: {
  width?: number;
  tone?: "auto" | "deep";
  variant?: LogoVariant;
  decorative?: boolean;
  className?: string;
}) {
  const symbol = variant === "ico" || (variant === undefined && width < 96);
  const asset = symbol ? "simbolo" : "logo";
  const w = Math.max(width, 24);
  const h = symbol
    ? Math.round((w * 2) / 3)
    : Math.round((w * 332.96) / 1365.22);
  const alt = decorative ? "" : "Aesteros";
  const img = (theme: "claro" | "oscuro") =>
    `/brand/aesteros/aesteros-${asset}-${theme}.svg`;

  return (
    <BrandImage
      light={img("claro")}
      dark={img("oscuro")}
      tone={tone}
      alt={alt}
      width={w}
      height={h}
      className={`inline-flex ${className}`}
    />
  );
}
