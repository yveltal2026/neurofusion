"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/brand/icon";

const LINKS = [
  { href: "/projects", label: "Proyectos", icon: "folder", match: /^\/(projects|studies|batteries)(\/|$)/ },
  { href: "/muestra", label: "Calculadora de muestra", icon: "target", match: /^\/muestra\/?$/ },
  { href: "/membresia", label: "Membresía", icon: "bolt", match: /^\/membresia\/?$/ },
] as const;

export function WorkspaceNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegación principal" className="space-y-1">
      {LINKS.map(({ href, label, icon, match }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : match.test(pathname) ? "location" : undefined}
          className="workspace-nav-link"
        >
          <Icon name={icon} className="size-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
