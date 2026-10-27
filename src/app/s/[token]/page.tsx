import type { Metadata } from "next";
import { apiMessage, availabilityError, loadParticipantStudyByToken } from "@/lib/participant-api";
import { loadEyeStudyByToken } from "@/tools/visual/eye/participant.server";
import { EyeStudyRunner } from "@/tools/visual/eye/EyeStudyRunner";
import { Runner } from "@/tools/iat/runner/Runner";
import { SurveyRunner } from "@/tools/survey/runner/SurveyRunner";
import { VariantRunner } from "@/tools/variants/runner/VariantRunner";

// La liga es privada: no debe indexarse ni mostrar vistas previas con datos del estudio.
export const metadata: Metadata = {
  title: "Estudio",
  robots: { index: false, follow: false },
};

function Unavailable({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-6 text-center">
      <p>{message}</p>
    </main>
  );
}

export default async function ParticipantPage({ params, searchParams }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  // Vista previa (para el investigador): corre el test completo sin guardar nada.
  const preview = sp.preview === "1";

  const loaded = await loadParticipantStudyByToken(token);
  if (!loaded.ok) {
    if (loaded.code !== "invalid_link") return <Unavailable message={apiMessage(loaded.code)} />;
    const eye = await loadEyeStudyByToken(token, true);
    if (!eye.ok) return <Unavailable message={apiMessage(eye.code)} />;
    const unavailable = availabilityError(eye.study);
    if (unavailable && !preview) return <Unavailable message={apiMessage(unavailable)} />;
    return <EyeStudyRunner token={token} study={eye.study} preview={preview} />;
  }

  const unavailable = availabilityError(loaded.study);
  if (unavailable && !preview) return <Unavailable message={apiMessage(unavailable)} />;

  // La pantalla del participante depende de la herramienta del estudio.
  if (loaded.tool === "iat") return <Runner token={token} config={loaded.study.config} preview={preview} />;
  if (loaded.tool === "iat_variant") return <VariantRunner token={token} config={loaded.study.config} preview={preview} />;
  return <SurveyRunner token={token} config={loaded.study.config} preview={preview} />;
}
