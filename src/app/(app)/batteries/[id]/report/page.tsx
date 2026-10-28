import { Breadcrumbs, projectCrumbs } from "@/components/ui/breadcrumbs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { loadBatteryReportInput } from "@/tools/battery/report/load";
import { buildBatteryReport } from "@/tools/battery/report/report";
import { ReportView } from "@/tools/battery/report/ui/ReportView";

export const metadata = { title: "Informe integrado · NeuroFusion" };

export default async function BatteryReportPage({
  params,
}: PageProps<"/batteries/[id]/report">) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const input = await loadBatteryReportInput(supabase, id);
  if (!input) notFound();
  const { detail, steps, unreadable, participants } = input;
  const report = buildBatteryReport(steps, participants);
  const { data: project } = await supabase.from("projects").select("name").eq("id", detail.battery.project_id).maybeSingle<{ name: string }>();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              ...projectCrumbs(detail.battery.project_id, project?.name),
              { label: detail.battery.name, href: `/batteries/${id}` },
            ]}
          />
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight">
            Informe integrado
          </h1>
          <p className="mt-1 text-xs text-muted">
            Batería · lo medido (IAT, variantes y encuestas), la exposición a las imágenes y lo estimado (cruces y lectura de la IA)
          </p>
        </div>
        <Link
          href={`/api/batteries/${id}/export`}
          prefetch={false}
          className={buttonClass("secondary")}
        >
          Descargar CSV
        </Link>
      </div>
      {steps.length === 0 ? (
        <Alert tone="warning">
          Esta batería no tiene pasos activos que se puedan reportar.
        </Alert>
      ) : (
        <ReportView
          batteryId={id}
          report={report}
          steps={steps}
          unreadable={unreadable}
        />
      )}
    </div>
  );
}
