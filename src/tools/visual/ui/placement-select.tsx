import type { SelectHTMLAttributes } from "react";
import { getPlacement, placementsByGroup, type PlacementSpec } from "../engine/placements";

const control = "w-full rounded-md border border-control bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary";

/**
 * Selector de formato agrupado (redes, display, impresos, web). Es un `<select>` nativo con
 * `<optgroup>`: accesible con teclado y lector de pantalla, y cómodo en celular.
 */
export function PlacementSelect({
  placeholder = "Elige un formato…",
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }) {
  return (
    <select className={`${control} ${className}`} {...props}>
      <option value="" disabled={props.required}>
        {placeholder}
      </option>
      {placementsByGroup().map(({ group, items }) => (
        <optgroup key={group} label={group}>
          {items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Resumen de lo que se revisará con el formato elegido (una línea). */
export function placementSummary(spec: PlacementSpec): string {
  const parts: string[] = [spec.group];
  if (spec.exact) parts.push(`exacto ${spec.exact.width}×${spec.exact.height} px`);
  else if (spec.print) parts.push(`mínimo ${spec.print.minPpi} ppp (${spec.minWidth}×${spec.minHeight} px)`);
  else parts.push(`mínimo ${spec.minWidth}×${spec.minHeight} px`);
  if (spec.maxBytes) parts.push(`máx. ${spec.maxBytes >= 1_000_000 ? `${Math.round(spec.maxBytes / 1_000_000)} MB` : `${Math.round(spec.maxBytes / 1000)} KB`}`);
  return parts.join(" · ");
}

export function PlacementHint({ id }: { id: string | null | undefined }) {
  const spec = getPlacement(id);
  if (!spec) return null;
  return <p className="text-xs text-muted">{placementSummary(spec)}</p>;
}
