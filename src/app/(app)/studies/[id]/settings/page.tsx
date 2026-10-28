import { notFound, redirect } from "next/navigation";
import { RenameStudyForm } from "@/components/rename-study-form";
import { StudyHeader } from "@/components/study-header";
import { Button } from "@/components/ui/button";
import { Block } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import type { StudyRow } from "@/lib/db/types";
import { seoConfigSchema } from "@/tools/seo/config";
import { SeoSettingsForm } from "@/tools/seo/ui/forms";
import { visualConfigSchema } from "@/tools/visual/config";
import { VisualContextForm } from "@/tools/visual/ui/forms";
import { deleteStudy } from "../actions";

export const metadata = { title: "Ajustes · NeuroFusion" };

export default async function SettingsPage({ params }: PageProps<"/studies/[id]/settings">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: study } = await supabase.from("studies").select("*").eq("id", id).maybeSingle<StudyRow>();
  if (!study) notFound();
  // El IAT tiene sus ajustes (liga, cupo, candado) en la página de resumen.
  if (study.tool_type === "iat" || study.tool_type === "iat_variant") redirect(`/studies/${id}`);
  const { data: project } = await supabase.from("projects").select("name").eq("id", study.project_id).maybeSingle();

  const seo = study.tool_type === "seo" ? seoConfigSchema.safeParse(study.config) : null;
  const visual = study.tool_type === "visual" ? visualConfigSchema.safeParse(study.config) : null;
  const variant = study.tool_type === "seo" ? "seo" : visual?.success && visual.data.mode === "journey" ? "journey" : visual?.success && visual.data.mode === "pieces" && visual.data.eyeTracking ? "eye" : "pieces";

  return (
    <div className="space-y-8">
      <StudyHeader study={study} projectName={project?.name} active="settings" variant={variant} />
      <Block className="space-y-4">
        <h2 className="text-xl font-semibold">Nombre</h2>
        <RenameStudyForm id={study.id} name={study.name} />
      </Block>
      {seo?.success ? (
        <Block className="space-y-4">
          <h2 className="text-xl font-semibold">Configuración de la auditoría</h2>
          <SeoSettingsForm studyId={study.id} config={seo.data} />
        </Block>
      ) : null}
      {visual?.success ? (
        <Block className="space-y-4">
          <h2 className="text-xl font-semibold">{variant === "eye" ? "Contexto del estudio" : "Contexto del análisis"}</h2>
          <VisualContextForm studyId={study.id} config={visual.data} />
        </Block>
      ) : null}
      <Block className="space-y-4 border-danger/30">
        <h2 className="text-xl font-semibold text-danger">Zona de riesgo</h2>
        <form action={deleteStudy}>
          <input type="hidden" name="id" value={study.id} />
          <Button type="submit" variant="danger">
            Eliminar estudio y todos sus datos{study.tool_type === "visual" ? " e imágenes" : ""}
          </Button>
        </form>
      </Block>
    </div>
  );
}
