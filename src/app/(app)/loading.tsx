/** Esqueleto mientras carga una pantalla del investigador (sin spinner en medio del contenido). */
export default function AppLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-foreground/10 motion-reduce:animate-none" />
        <div className="h-8 w-80 max-w-full animate-pulse rounded bg-foreground/10 motion-reduce:animate-none" />
      </div>
      <div className="h-10 w-full animate-pulse rounded bg-foreground/5 motion-reduce:animate-none" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-40 animate-pulse rounded-lg bg-foreground/5 motion-reduce:animate-none" />
        <div className="h-40 animate-pulse rounded-lg bg-foreground/5 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
