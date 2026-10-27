import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyLink } from "@/components/copy-link";
import { DuplicateStudyForm } from "@/components/duplicate-study-form";
import { StudyTabs } from "@/components/study-tabs";
import { StudySettingsForm } from "@/components/study-settings-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/brand/icon";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { IconTile } from "@/components/ui/icon-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tag } from "@/components/ui/tag";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { StudyRow } from "@/lib/db/types";
import { publicEnv } from "@/lib/env";
import { magicLinkUrl } from "@/lib/magic-link";
import { iatConfigSchema } from "@/tools/iat/config";
import { estimateMinutes, trialsPerDimension } from "@/tools/iat/engine/protocol";
import { BATTERY_BLOCK_MESSAGE } from "@/tools/battery/messages";
import { SeoOverview } from "@/tools/seo/ui/overview";
import { SurveyOverview } from "@/tools/survey/ui/overview";
import { VariantOverview } from "@/tools/variants/ui/overview";
import { VisualOverview } from "@/tools/visual/ui/overview";
import { EyeOverview } from "@/tools/eyetracking/ui/overview";
import { getStudyTool } from "@/tools/registry";
import { deleteStudy, regenerateLink } from "./actions";

export async function generateMetadata({ params }: PageProps<"/studies/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("studies").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ? `${data.name} · NeuroFusion` : "Estudio · NeuroFusion" };
}

// La auditoría SEO en vivo y el análisis visual con IA se ejecutan desde esta página.
export const maxDuration = 120;

const STATUS_LABEL = { draft: "Borrador", published: "Publicado", closed: "Cerrado" } as const;

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : publicEnv().appUrl;
}

export default async function StudyPage({ params, searchParams }: PageProps<"/studies/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const { data: study } = await supabase.from("studies").select("*").eq("id", id).maybeSingle<StudyRow>();
  if (!study) notFound();
  const { data: project } = await supabase.from("projects").select("id, name").eq("id", study.project_id).maybeSingle();

  if (study.tool_type === "seo") return <SeoOverview study={study} projectName={project?.name ?? null} created={sp.created === "1"} />;
  if (getStudyTool(study)?.type === "eyetracking") return <EyeOverview study={study} projectName={project?.name ?? null} created={sp.created === "1"} />;
  if (study.tool_type === "visual")
    return <VisualOverview study={study} projectName={project?.name ?? null} created={sp.created === "1"} />;
  if (study.tool_type === "iat_variant") {
    const link = magicLinkUrl(await requestOrigin(), study.access_token ?? "");
    return (
      <VariantOverview
        study={study}
        projectName={project?.name ?? null}
        link={link}
        created={sp.created === "1"}
        copied={sp.copied === "1"}
        blocked={sp.blocked === "battery"}
      />
    );
  }
  if (study.tool_type === "survey") {
    const link = magicLinkUrl(await requestOrigin(), study.access_token ?? "");
    return (
      <SurveyOverview
        study={study}
        projectName={project?.name ?? null}
        link={link}
        created={sp.created === "1"}
        copied={sp.copied === "1"}
        blocked={sp.blocked === "battery"}
      />
    );
  }
  return (
    <IatOverview
      study={study}
      projectName={project?.name ?? null}
      created={sp.created === "1"}
      copied={sp.copied === "1"}
      blocked={sp.blocked === "battery"}
    />
  );
}

async function IatOverview({
  study,
  projectName,
  created,
  copied,
  blocked,
}: {
  study: StudyRow;
  projectName: string | null;
  created: boolean;
  copied: boolean;
  blocked: boolean;
}) {
  const id = study.id;
  const config = iatConfigSchema.safeParse(study.config);
  const link = magicLinkUrl(await requestOrigin(), study.access_token ?? "");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <IconTile name="neuro" size="lg" className="mt-1 hidden sm:inline-flex" />
          <div>
            <Link href={`/projects/${study.project_id}`} className="inline-block py-1 text-sm text-muted hover:underline">
              ← {projectName ?? "Proyecto"}
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{study.name}</h1>
            <p className="mt-2 flex items-center gap-2 text-xs text-muted">
              <Tag>IAT</Tag>
              <StatusBadge tone={study.status === "published" ? "success" : study.status === "closed" ? "warning" : "neutral"}>
                {STATUS_LABEL[study.status]}
              </StatusBadge>
            </p>
          </div>
        </div>
      </div>

      <StudyTabs id={id} active="overview" />

      {created ? <Alert>¡Estudio generado! Comparte la liga con tus participantes.</Alert> : null}
      {copied ? <Alert>Copia creada en borrador. Revisa la configuración y publícala en Ajustes.</Alert> : null}
      {blocked ? <Alert tone="warning">{BATTERY_BLOCK_MESSAGE}</Alert> : null}

      <Card className="space-y-3">
        <div>
          <SectionTitle icon="link">Liga mágica</SectionTitle>
          <p className="text-sm text-muted">
            Comparte esta liga con tantos participantes como necesites. No requiere cuenta ni contraseña.
          </p>
        </div>
        <CopyLink url={link} />
        <a
          href={`${link}?preview=1`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-heading underline underline-offset-4"
        >
          <Icon name="eye" className="size-5" />
          Abrir vista previa (no guarda datos)
        </a>
        {study.status !== "published" ? (
          <Alert tone="warning">La liga está inactiva porque el estudio está en estado «{STATUS_LABEL[study.status].toLowerCase()}».</Alert>
        ) : null}
        <p className="text-xs text-muted">
          Tip: para mayor fiabilidad de los tiempos de reacción, pide a tus participantes que respondan desde una computadora con teclado.
          También funciona en celular.
        </p>
      </Card>

      {config.success ? (
        <Card className="space-y-3">
          <SectionTitle icon="layers">Diseño del estudio</SectionTitle>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
            <dt className="text-muted">Producto</dt>
            <dd>{config.data.product}</dd>
            <dt className="text-muted">Conceptos</dt>
            <dd>
              {config.data.conceptA.label} vs {config.data.conceptB.label}
            </dd>
            <dt className="text-muted">Dimensiones</dt>
            <dd>{config.data.dimensions.map((d) => `${d.name} (${d.positiveLabel} / ${d.negativeLabel})`).join(" · ")}</dd>
            <dt className="text-muted">Protocolo</dt>
            <dd>
              {config.data.protocol === "classic7" ? "Clásico de 7 bloques" : "Demo de 5 bloques"} ·{" "}
              {trialsPerDimension(config.data.protocol)} ensayos por dimensión · ~
              {estimateMinutes(config.data.protocol, config.data.dimensions.length)} min
            </dd>
          </dl>
        </Card>
      ) : (
        <Alert tone="warning">La configuración guardada de este estudio no es válida.</Alert>
      )}

      <Card className="space-y-4">
        <SectionTitle icon="settings">Ajustes</SectionTitle>
        <StudySettingsForm
          id={study.id}
          status={study.status}
          maxResponses={study.max_responses}
          closesAt={study.closes_at}
          duplicatePolicy={study.duplicate_policy}
        />
      </Card>

      <DuplicateStudyForm studyId={study.id} projectId={study.project_id} />

      <Card className="space-y-4 border-danger/30">
        <SectionTitle icon="alert" className="text-danger">
          Zona de riesgo
        </SectionTitle>
        <div className="flex flex-wrap gap-3">
          <form action={regenerateLink}>
            <input type="hidden" name="id" value={study.id} />
            <Button type="submit" variant="secondary">
              <Icon name="refresh" className="size-5" />
              Regenerar liga (invalida la actual)
            </Button>
          </form>
          <form action={deleteStudy}>
            <input type="hidden" name="id" value={study.id} />
            <Button type="submit" variant="danger">
              <Icon name="trash" className="size-5" />
              Eliminar estudio y todos sus datos
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
