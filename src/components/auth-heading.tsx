import { Logo } from "@/components/brand/logo";

/** Encabezado común de las pantallas de acceso: logo, título y línea de contexto. */
export function AuthHeading({ title, subtitle = "NeuroFusion · estudios de neuromarketing" }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-3 text-center">
      <Logo width={140} className="mx-auto" />
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted">{subtitle}</p>
    </div>
  );
}
