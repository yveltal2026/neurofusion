import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="bg-resplandor flex min-h-dvh flex-1 items-center">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-9 px-5 py-10 sm:px-9 md:grid-cols-[1.1fr_1fr] md:gap-16 md:py-16">
        <div className="space-y-4 md:space-y-6">
          <Logo width={184} tone="deep" />
          <p className="max-w-[12ch] text-[clamp(2.25rem,6vw,4.5rem)] leading-[.98] font-extrabold tracking-tight [font-stretch:110%]">
            Percepción, comparada.
          </p>
          <p className="max-w-[42ch] text-base text-muted sm:text-lg">
            Investiga qué mira, qué asocia y qué opina la gente, con el margen de error a la vista.
          </p>
        </div>
        <div className="glass-panel w-full min-w-0 rounded-panel p-5 sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
