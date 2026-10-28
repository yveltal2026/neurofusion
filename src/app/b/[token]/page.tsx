import type { Metadata } from "next";
import { StatusScreen } from "@/components/participant";
import {
  apiMessage,
  availabilityError,
  loadBatteryByToken,
} from "@/lib/participant-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPreviewSteps } from "@/tools/battery/participant";
import { BatteryRunner } from "@/tools/battery/runner/BatteryRunner";

// La liga es privada: no debe indexarse ni mostrar vistas previas con datos del estudio.
export const metadata: Metadata = {
  title: "Estudio",
  robots: { index: false, follow: false },
};

function Unavailable({ message }: { message: string }) {
  return (
    <StatusScreen icon="ban" title="No podemos abrir este estudio">
      <p>{message}</p>
    </StatusScreen>
  );
}

export default async function BatteryPage({
  params,
  searchParams,
}: PageProps<"/b/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  // Vista previa (para el investigador): recorre los pasos activos sin guardar nada.
  const preview = sp.preview === "1";

  const loaded = await loadBatteryByToken(token);
  if (!loaded.ok) return <Unavailable message={apiMessage(loaded.code)} />;
  const battery = loaded.study;

  const unavailable = availabilityError(battery);
  if (unavailable && !preview)
    return <Unavailable message={apiMessage(unavailable)} />;

  if (!preview)
    return (
      <BatteryRunner token={token} config={battery.config} preview={false} />
    );

  const steps = await loadPreviewSteps(createAdminClient(), battery.id);
  if (!steps.ok) return <Unavailable message={apiMessage(steps.code)} />;
  return (
    <BatteryRunner
      token={token}
      config={battery.config}
      preview
      previewSteps={steps.steps}
    />
  );
}
