"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

/**
 * Selector de archivos en español. El input nativo muestra «Choose Files / No file chosen»
 * según el idioma del navegador; aquí queda oculto (pero accesible y enfocable) dentro de
 * una etiqueta con estilo de botón secundario.
 */
export function FilePicker({
  label = "Elegir archivos",
  onFiles,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: string; onFiles?: (files: File[]) => void }) {
  const id = useId();
  const [names, setNames] = useState<string[]>([]);
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <label
        htmlFor={props.id ?? id}
        className={`inline-flex h-11 cursor-pointer items-center rounded-full border-2 border-heading px-5 font-display text-sm font-semibold text-heading transition hover:bg-heading/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-heading ${props.disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        {label}
        <input
          {...props}
          id={props.id ?? id}
          type="file"
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            setNames(files.map((f) => f.name));
            onFiles?.(files);
            props.onChange?.(e);
          }}
        />
      </label>
      <span className="text-sm text-muted" aria-live="polite">
        {names.length === 0 ? "Ningún archivo elegido" : names.length === 1 ? names[0] : `${names.length} archivos elegidos`}
      </span>
    </span>
  );
}
