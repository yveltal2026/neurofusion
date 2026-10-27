import Link from "next/link";
import { ResonanceMotif } from "@/components/brand/bubbles";
import type { IconName } from "@/components/brand/icon";
import { Logo } from "@/components/brand/logo";
import { WaveEdge } from "@/components/brand/wave";
import { buttonClass } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: "neuro", title: "Diseña", text: "Un asistente arma el IAT con el rigor metodológico." },
  { icon: "link", title: "Comparte", text: "Una liga para todos tus participantes, sin cuentas." },
  { icon: "results", title: "Analiza", text: "Estadística y conclusiones asistidas por IA." },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Portada en modo profundo: teal con el resplandor de Neuro por la esquina superior derecha (manual v4.1, cap. 6). */}
      <section className="bg-resplandor">
        <div className="mx-auto grid w-full max-w-5xl items-center gap-10 px-6 pb-16 pt-12 md:grid-cols-[1.15fr_0.85fr] md:pb-24 md:pt-20">
          <div className="animate-rise space-y-7">
            <Logo width={168} tone="deep" />
            <h1 className="max-w-[20ch] text-[clamp(2.2rem,5.4vw,3.6rem)] font-extrabold leading-[1.08]">
              Evidencia sobre <em className="not-italic text-neuro-on-deep">cómo decide</em> la gente.
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
          </div>
          <ResonanceMotif tone="deep" className="animate-rise mx-auto w-full max-w-sm [--rise-delay:0.15s] md:max-w-none" />
        </div>
      </section>
      <WaveEdge className="h-6 md:h-10" />

      <section className="mx-auto w-full max-w-5xl px-6 pb-16 pt-8 md:pb-24">
        <ul className="grid gap-8 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.title} className="space-y-3">
              <IconTile name={s.icon} size="lg" />
              <p className="font-display text-lg font-semibold text-heading">{s.title}</p>
              <p className="text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-12 text-sm text-muted">
          NeuroFusion es la división de neuromarketing de FRSKO. <span className="whitespace-nowrap">Marketing que se nota.</span>
        </p>
      </section>
    </main>
  );
}
