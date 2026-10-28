import { SampleCalculator } from "@/components/sample-calculator";

export const metadata = { title: "Calculadora de muestra · NeuroFusion" };

export default function SampleSizePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calculadora de muestra</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Cuántos participantes necesitas, o qué puedes concluir con los que tienes. Útil para planear un estudio y para explicar sus
          límites.
        </p>
      </div>
      <SampleCalculator />
    </div>
  );
}
