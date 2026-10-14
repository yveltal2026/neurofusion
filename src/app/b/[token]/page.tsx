import type { Metadata } from "next";
import { apiMessage, availabilityError } from "@/lib/participant-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { BatteryRunner } from "@/tools/battery/runner/BatteryRunner";
import { loadBatteryByToken } from "@/tools/battery/server";

// La liga es privada: no debe indexarse ni mostrar vistas previas con datos del estudio.
export const metadata: Metadata = {
  title: "Estudio",
  robots: { index: false, follow: false },
};

function Unavailable({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p>{message}</p>
    </main>
  );
}

export default async function BatteryPage({ params, searchParams }: PageProps<"/b/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  // Vista previa (para el investigador): corre todos los pasos sin guardar nada.
  const preview = sp.preview === "1";

  const loaded = await loadBatteryByToken(createAdminClient(), token);
  if (!loaded.ok) return <Unavailable message={apiMessage(loaded.code)} />;
  const { battery } = loaded;

  const unavailable = availabilityError(battery);
  if (unavailable && !preview) return <Unavailable message={apiMessage(unavailable)} />;
  if (battery.steps.length === 0) return <Unavailable message={apiMessage("not_available")} />;

  return <BatteryRunner token={token} name={battery.name} config={battery.config} steps={battery.steps} preview={preview} />;
}
