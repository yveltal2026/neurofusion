import type { InputHTMLAttributes } from "react";

/** Interruptor accesible (casilla nativa con role="switch"). La posición de la perilla, no sólo el color, indica el estado. */
export function Switch({
  label,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> & {
  label: string;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-heading ${className}`}
    >
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        {...props}
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-10 shrink-0 rounded-full border-2 border-heading/60 transition-colors duration-150 after:absolute after:left-0.5 after:top-1/2 after:size-3.5 after:-translate-y-1/2 after:rounded-full after:bg-heading/70 after:transition-transform after:duration-150 peer-checked:border-heading peer-checked:bg-heading peer-checked:after:translate-x-4 peer-checked:after:bg-background peer-focus-visible:ring-2 peer-focus-visible:ring-heading peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface peer-disabled:opacity-50 motion-reduce:transition-none motion-reduce:after:transition-none"
      />
      {label}
    </label>
  );
}
