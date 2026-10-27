/** Encabezado común de las pantallas de acceso: título y línea de contexto (el logo vive en la franja profunda del layout). */
export function AuthHeading({ title, subtitle = "NeuroFusion · estudios de neuromarketing" }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-2 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted">{subtitle}</p>
    </div>
  );
}
