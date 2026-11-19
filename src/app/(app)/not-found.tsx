import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="glass-panel mx-auto max-w-xl space-y-4 rounded-panel px-6 py-12 text-center">
      <h1 className="text-3xl font-bold tracking-tight">No encontramos lo que buscas</h1>
      <p className="text-muted">El proyecto o estudio no existe, se eliminó o pertenece a otra organización.</p>
      <Link href="/projects" className={buttonClass("secondary")}>
        Ir a proyectos
      </Link>
    </div>
  );
}
