import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "inverse";
type Size = "md" | "sm" | "lg";

const styles: Record<Variant, string> = {
  primary: "border-2 border-transparent bg-primary text-primary-foreground hover:brightness-95 active:scale-[.97]",
  inverse: "border-2 border-transparent bg-heading text-background hover:brightness-90",
  secondary: "border-2 border-heading text-heading hover:bg-heading/10",
  ghost: "border-2 border-transparent text-heading hover:bg-heading/10",
  danger: "border-2 border-transparent bg-danger text-danger-foreground hover:brightness-95 active:scale-[.97]",
};

const sizes: Record<Size, string> = { md: "h-11 px-5 text-sm", sm: "min-h-11 px-4 text-sm", lg: "h-14 px-7 text-base" };

export function buttonClass(variant: Variant = "primary", extra = "", size: Size = "md"): string {
  return `inline-flex ${sizes[size]} items-center justify-center gap-2 rounded-full font-display font-semibold transition duration-[var(--duracion-micro)] ease-bubble disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100 ${styles[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, className, size)} {...props} />;
}
