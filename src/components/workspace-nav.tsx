"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function WorkspaceNav() {
  const pathname = usePathname();
  const links = [
    {
      href: "/projects",
      label: "Proyectos",
      active: /^\/(projects|studies|batteries)(\/|$)/.test(pathname),
    },
    {
      href: "/muestra",
      label: "Calculadora de muestra",
      active: pathname === "/muestra",
    },
    {
      href: "/membresia",
      label: "Membresía",
      active: pathname === "/membresia",
    },
  ];

  return (
    <nav
      aria-label="Navegación principal"
      className="order-last flex w-full gap-1 sm:order-none sm:w-auto"
    >
      {links.map(({ href, label, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={
            active ? (pathname === href ? "page" : "location") : undefined
          }
          className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold sm:px-4 ${active ? "bg-heading text-background" : "text-muted hover:bg-surface-muted hover:text-heading"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
