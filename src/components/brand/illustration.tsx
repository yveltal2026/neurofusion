import Image from "next/image";

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
    <picture className={className}>
      {tone === "auto" ? <source media="(prefers-color-scheme: dark)" srcSet={image("oscuro")} /> : null}
      <Image src={image(tone === "deep" ? "oscuro" : "claro")} alt="" width={240} height={180} unoptimized />
    </picture>
  );
}
