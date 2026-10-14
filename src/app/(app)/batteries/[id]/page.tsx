import Link from "next/link";
import { CopyLink } from "@/components/copy-link";
import { BatteryTabs } from "@/components/battery-tabs";
import { Icon } from "@/components/brand/icon";
import { StudySettingsForm } from "@/components/study-settings-form";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { SectionTitle } from "@/components/ui/section-title";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth/session";
import { loadBatteryForResearcher } from "@/lib/batteries";
import { batteryLinkUrl } from "@/lib/magic-link";
import { requestOrigin } from "@/lib/request-origin";
import { BatteryStepsForm } from "@/tools/battery/builder/BatteryStepsForm";
import { StepsEditor } from "@/tools/battery/builder/StepsEditor";
import { orderWarnings } from "@/tools/battery/engine/config";
import { infosOf } from "@/tools/battery/builder/StepsEditor";
import { deleteBattery, regenerateBatteryLink, updateBatterySettings } from "../actions";

const STATUS_LABEL = { draft: "Borrador", published: "Publicado", closed: "Cerrado" } as const;
const STATUS_TONE = { draft: "neutral", published: "success", closed: "warning" } as const;

export async function generateMetadata({ params }: PageProps<"/batteries/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("batteries").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ? `${data.name} · NeuroFusion` : "Batería · NeuroFusion" };
}

export default async function BatteryPage({ params, searchParams }: PageProps<"/batteries/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const { battery, steps, options, sessionCount, projectName } = await loadBatteryForResearcher(supabase, id);

  const link = batteryLinkUrl(await requestOrigin(), battery.access_token);
  const draftSteps = steps.map((s) => ({ studyId: s.study_id, enabled: s.enabled }));
  const blocking = orderWarnings(infosOf(draftSteps, options)).filter((w) => w.level === "error");

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <IconTile name="layers" size="lg" className="mt-1 hidden sm:inline-flex" />
          <div>
            <Link href={`/projects/${battery.project_id}`} className="inline-block py-1 text-sm text-muted hover:underline print:hidden">
              ← {projectName ?? "Proyecto"}
            </Link>
            <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight">{battery.name}</h1>
            <p className="mt-2 flex items-center gap-2 text-xs text-muted">
              <span className="uppercase">Batería</span>
              <StatusBadge tone={STATUS_TONE[battery.status]}>{STATUS_LABEL[battery.status]}</StatusBadge>
              {sessionCount} {sessionCount === 1 ? "sesión" : "sesiones"}
            </p>
          </div>
        </div>
        <BatteryTabs id={id} active="overview" />
      </div>

      {sp.created === "1" ? (
        <Alert tone={battery.status === "published" ? "info" : "warning"}>
          {battery.status === "published"
            ? "¡Batería generada! Comparte la liga con tus participantes."
            : "Batería creada en borrador: hay pasos sin publicar. Publícalos y luego abre la batería en Ajustes."}
        </Alert>
      ) : null}

      <Card className="space-y-4">
        <SectionTitle icon="link">Liga mágica</SectionTitle>
        <p className="text-sm text-muted">Una sola liga para todos los pasos. Cada participante da un consentimiento y recorre los estudios en orden.</p>
        <CopyLink url={link} />
        <a href={`${link}?preview=1`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "h-9 w-fit")}>
          <Icon name="eye" className="size-5" />
          Abrir vista previa (no guarda datos)
        </a>
        {battery.status !== "published" ? (
          <Alert tone="warning">La liga está inactiva porque la batería está en estado «{STATUS_LABEL[battery.status].toLowerCase()}».</Alert>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <SectionTitle icon="target">Pasos</SectionTitle>
        {sessionCount === 0 ? (
          <BatteryStepsForm batteryId={id} studies={options} initial={draftSteps} />
        ) : (
          <>
            <StepsEditor studies={options} steps={draftSteps} onChange={() => {}} disabled />
            <Alert>
              La batería ya tiene respuestas, así que sus pasos no se pueden cambiar: mezclaría sesiones corridas de maneras distintas. Para
              probar otro orden, crea una batería nueva.
            </Alert>
          </>
        )}
      </Card>

      <Card className="space-y-4">
        <SectionTitle icon="settings">Ajustes</SectionTitle>
        {blocking.length && battery.status !== "published" ? <Alert tone="warning">{blocking[0]!.text}</Alert> : null}
        <StudySettingsForm
          id={battery.id}
          status={battery.status}
          maxResponses={battery.max_responses}
          closesAt={battery.closes_at}
          duplicatePolicy={battery.duplicate_policy}
          action={updateBatterySettings}
        />
        <p className="text-xs text-muted">
          El límite de respuestas y el candado de esta batería mandan. Los estudios que forman la batería no deben llevar límite propio, o podrían
          cerrarse antes y dejar a alguien a medias.
        </p>
      </Card>

      <Card className="space-y-4 border-danger/30">
        <SectionTitle icon="alert" className="text-danger">
          Zona de riesgo
        </SectionTitle>
        <div className="flex flex-wrap gap-3">
          <form action={regenerateBatteryLink}>
            <input type="hidden" name="id" value={battery.id} />
            <Button type="submit" variant="secondary">
              <Icon name="refresh" className="size-5" />
              Regenerar liga (invalida la actual)
            </Button>
          </form>
          <form action={deleteBattery}>
            <input type="hidden" name="id" value={battery.id} />
            <Button type="submit" variant="danger">
              <Icon name="trash" className="size-5" />
              Eliminar batería y las sesiones de sus participantes
            </Button>
          </form>
        </div>
        <p className="text-xs text-muted">Los estudios que la forman no se borran; sí las sesiones de participante que se hicieron a través de la batería.</p>
      </Card>
    </div>
  );
}
