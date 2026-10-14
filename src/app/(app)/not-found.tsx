import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">No encontramos lo que buscas</h1>
      <p className="text-muted">El proyecto o estudio no existe, se eliminó o pertenece a otra organización.</p>
      <Link href="/projects" className={buttonClass("secondary")}>
        Ir a proyectos
      </Link>
    </div>
  );
}
