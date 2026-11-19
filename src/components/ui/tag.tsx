import type { ReactNode } from "react";

export function Tag({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-display font-semibold text-accent-ink ${className}`}>
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-neuro" />
      {children}
    </span>
  );
}
