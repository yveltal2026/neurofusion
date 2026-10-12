import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

// Principal: menta con texto teal (una sola vez por pantalla). Secundario: contorno. Píldora completa.
const styles: Record<Variant, string> = {
  primary: "border-2 border-transparent bg-primary text-primary-foreground hover:-translate-y-0.5",
  secondary: "border-2 border-heading text-heading hover:bg-heading/10",
  ghost: "border-2 border-transparent text-heading hover:bg-heading/10",
  danger: "border-2 border-transparent bg-danger text-danger-foreground hover:-translate-y-0.5",
};

export function buttonClass(variant: Variant = "primary", extra = ""): string {
  return `inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 font-display text-sm font-semibold transition duration-150 ease-bubble disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${styles[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}
