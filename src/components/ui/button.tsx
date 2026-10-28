import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm" | "lg";

// Principal: Neuro (morado en claro, lila en profundo) con texto de contraste, una sola vez por pantalla. Secundario: contorno. Píldora completa.
const styles: Record<Variant, string> = {
  primary: "border-2 border-transparent bg-primary text-primary-foreground hover:-translate-y-0.5",
  secondary: "border-2 border-heading text-heading hover:bg-heading/10",
  ghost: "border-2 border-transparent text-heading hover:bg-heading/10",
  danger: "border-2 border-transparent bg-danger text-danger-foreground hover:-translate-y-0.5",
};

const sizes: Record<Size, string> = { md: "h-11 px-5 text-sm", sm: "h-9 px-4 text-sm", lg: "h-14 px-7 text-base" };

export function buttonClass(variant: Variant = "primary", extra = "", size: Size = "md"): string {
  return `inline-flex ${sizes[size]} items-center justify-center gap-2 rounded-full font-display font-semibold transition duration-150 ease-bubble disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${styles[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, className, size)} {...props} />;
}
