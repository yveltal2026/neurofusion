import { BrandImage } from "./brand-image";

type Name =
  | "mod-proyectos"
  | "ocular"
  | "atencion"
  | "asociacion"
  | "variantes"
  | "encuesta"
  | "seo"
  | "mod-baterias";

export function BrandIllustration({
  name,
  className = "",
  tone = "auto",
}: {
  name: Name;
  className?: string;
  tone?: "auto" | "deep";
}) {
  const image = (theme: "claro" | "oscuro") =>
    `/brand/aesteros/ilustracion-${name}-${theme}.svg`;
  return (
    <BrandImage
      light={image("claro")}
      dark={image("oscuro")}
      tone={tone}
      alt=""
      width={240}
      height={180}
      className={className}
    />
  );
}
