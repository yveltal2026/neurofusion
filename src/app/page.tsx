import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">NeuroFusion</h1>
      <p className="max-w-xl text-muted">
        Diseña, aplica y analiza estudios de neuromarketing. Empezamos con el Test de Asociación Implícita (IAT): crea el estudio,
        comparte una liga con tus participantes y analiza los resultados con estadística y conclusiones asistidas por IA.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className={buttonClass("primary")}>
          Iniciar sesión
        </Link>
        <Link href="/signup" className={buttonClass("secondary")}>
          Crear cuenta
        </Link>
      </div>
    </main>
  );
}
