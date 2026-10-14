import { Icon, type IconName } from "@/components/brand/icon";

/** Icono de marca sobre una base suave de menta: ancla visual de tarjetas, filas y encabezados. */
export function IconTile({ name, size = "md", className = "" }: { name: IconName; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = { sm: "size-9 p-1.5", md: "size-11 p-2", lg: "size-14 p-2.5" }[size];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-md bg-primary/15 text-heading ${box} ${className}`}>
      <Icon name={name} className="size-full" />
    </span>
  );
}
