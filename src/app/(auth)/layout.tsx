import { Bubbles } from "@/components/brand/bubbles";
import { Logo } from "@/components/brand/logo";
import { WaveEdge } from "@/components/brand/wave";

// Acceso en modo profundo: franja teal con el resplandor de Neuro y el logo, la ola de transición
// y el formulario sobre crema. Efervescencia 1: tres burbujas en una esquina.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col">
      <div className="bg-resplandor">
        <div className="mx-auto flex max-w-md justify-center px-6 pb-10 pt-12">
          <Logo width={176} tone="deep" />
        </div>
      </div>
      <WaveEdge className="h-6 md:h-8" />
      <div className="relative isolate flex flex-1 justify-center overflow-hidden px-6 pb-16 pt-8">
        <Bubbles className="pointer-events-none absolute -bottom-4 -left-4 -z-10 w-28 sm:w-40" />
        {children}
      </div>
    </main>
  );
}
