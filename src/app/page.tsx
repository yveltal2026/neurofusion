import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="bg-resplandor flex min-h-dvh flex-1 items-center">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-14 sm:px-10">
        <Logo width={184} tone="deep" />
        <h1 className="max-w-[12ch] text-[clamp(2.75rem,9vw,6.5rem)] leading-[.98] font-extrabold tracking-tight [font-stretch:110%]">
          Percepción, comparada.
        </h1>
        <p className="max-w-[44ch] text-lg text-muted">
          Diseña estudios de mirada, asociación y percepción. Comparte una liga con tus participantes y consulta los resultados.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login" className={buttonClass("primary")}>Iniciar sesión</Link>
          <Link href="/signup" className={buttonClass("secondary")}>Crear cuenta</Link>
        </div>
      </div>
    </main>
  );
}
