import Link from "next/link";
import { ResonanceMotif } from "@/components/brand/bubbles";
import { Icon, type IconName } from "@/components/brand/icon";
import { Logo } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "neuro", title: "Diseña", text: "Un asistente arma el IAT con el rigor metodológico." },
  { icon: "link", title: "Comparte", text: "Una liga para todos tus participantes, sin cuentas." },
  { icon: "results", title: "Analiza", text: "Estadística y conclusiones asistidas por IA." },
];

export default function Home() {
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 content-center items-center gap-12 px-6 py-16 md:grid-cols-[1.15fr_0.85fr] md:py-24">
      <div className="animate-rise space-y-7">
        <Logo width={168} />
        <h1 className="max-w-[20ch] text-[clamp(2.2rem,5.4vw,3.6rem)] font-extrabold leading-[1.08]">
          Evidencia sobre cómo decide la gente.
        </h1>
        <p className="max-w-[60ch] text-lg">
          Diseña, aplica y analiza estudios de neuromarketing. Empezamos con el Test de Asociación Implícita (IAT): crea el estudio,
          comparte una liga con tus participantes y analiza los resultados con estadística y conclusiones asistidas por IA.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login" className={buttonClass("primary")}>
            Iniciar sesión
          </Link>
          <Link href="/signup" className={buttonClass("secondary")}>
            Crear cuenta
          </Link>
        </div>
        <ul className="grid max-w-xl gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.title} className="space-y-1.5 text-heading">
              <Icon name={s.icon} className="size-9" />
              <p className="font-display text-sm font-semibold">{s.title}</p>
              <p className="text-xs text-muted">{s.text}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          NeuroFusion es la división de neuromarketing de FRSKO. <span className="whitespace-nowrap">Mercadotecnia fresca.</span>
        </p>
      </div>
      <ResonanceMotif className="animate-rise mx-auto w-full max-w-sm [--rise-delay:0.15s] md:max-w-none" />
    </main>
  );
}
