import { deleteStudy, regenerateLink } from "@/app/(app)/studies/[id]/actions";
import { CopyLink } from "@/components/copy-link";
import { DuplicateStudyForm } from "@/components/duplicate-study-form";
import { StudyHeader } from "@/components/study-header";
import { StudySettingsForm } from "@/components/study-settings-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Block, Panel } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import type { StudyRow } from "@/lib/db/types";
import { BATTERY_BLOCK_MESSAGE } from "@/tools/battery/messages";
import { VARIANT_INFO, variantConfigSchema } from "../config";
import { buildPlan, estimateVariantMinutes, totalTrials } from "../plan";

const STATUS_LABEL = { draft: "Borrador", published: "Publicado", closed: "Cerrado" } as const;

/** Resumen de una variante del IAT: liga mágica, diseño, ajustes de la liga y zona de riesgo. */
export function VariantOverview({
  study,
  projectName,
  link,
  created,
  copied = false,
  blocked = false,
}: {
  study: StudyRow;
  projectName: string | null;
  link: string;
  created: boolean;
  copied?: boolean;
  /** Se intentó eliminar un estudio que es paso de una batería. */
  blocked?: boolean;
}) {
  const config = variantConfigSchema.safeParse(study.config);

  return (
    <div className="space-y-8">
      <StudyHeader study={study} projectName={projectName} active="overview" variant="variant" subtitle={STATUS_LABEL[study.status]} />

      {copied ? <Alert>Copia creada en borrador. Revisa la configuración y publícala en Ajustes.</Alert> : null}
      {created ? <Alert>¡Estudio generado! Comparte la liga con tus participantes.</Alert> : null}
      {blocked ? <Alert tone="warning">{BATTERY_BLOCK_MESSAGE}</Alert> : null}

      <Panel className="space-y-3">
        <div>
          <SectionTitle icon="link">Liga mágica</SectionTitle>
          <p className="text-sm text-muted">Comparte esta liga con tantos participantes como necesites. No requiere cuenta ni contraseña.</p>
        </div>
        <CopyLink url={link} />
        <a href={`${link}?preview=1`} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-heading underline underline-offset-4">
          Abrir vista previa (no guarda datos) ↗
        </a>
        {study.status !== "published" ? (
          <Alert tone="warning">La liga está inactiva porque el estudio está en estado «{STATUS_LABEL[study.status].toLowerCase()}».</Alert>
        ) : null}
      </Panel>

      {config.success ? (
        <Block className="space-y-3">
          <SectionTitle icon="bolt">Diseño de la tarea</SectionTitle>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
            <dt className="text-muted">Variante</dt>
            <dd>{VARIANT_INFO[config.data.variant].name}</dd>
            <dt className="text-muted">Producto</dt>
            <dd>{config.data.product}</dd>
            <dt className="text-muted">Conceptos</dt>
            <dd>{config.data.concepts.map((c) => c.label).join(" · ")}</dd>
            <dt className="text-muted">Atributo</dt>
            <dd>
              {config.data.attribute.name}: {config.data.attribute.positiveLabel} / {config.data.attribute.negativeLabel}
            </dd>
            <dt className="text-muted">Duración</dt>
            <dd>
              {totalTrials(buildPlan(config.data, "overview"))} ensayos · unos {estimateVariantMinutes(config.data)} min
            </dd>
          </dl>
        </Block>
      ) : (
        <Alert tone="warning">La configuración guardada de este estudio no es válida.</Alert>
      )}

      <Block className="space-y-4">
        <SectionTitle icon="settings">Ajustes</SectionTitle>
        <StudySettingsForm id={study.id} status={study.status} maxResponses={study.max_responses} closesAt={study.closes_at} duplicatePolicy={study.duplicate_policy} />
      </Block>

      <DuplicateStudyForm studyId={study.id} projectId={study.project_id} />

      <Block className="space-y-4 border-danger/30">
        <SectionTitle icon="alert" className="text-danger">
          Zona de riesgo
        </SectionTitle>
        <div className="flex flex-wrap gap-3">
          <form action={regenerateLink}>
            <input type="hidden" name="id" value={study.id} />
            <Button type="submit" variant="secondary">
              Regenerar liga (invalida la actual)
            </Button>
          </form>
          <form action={deleteStudy}>
            <input type="hidden" name="id" value={study.id} />
            <Button type="submit" variant="danger">
              Eliminar estudio y todos sus datos
            </Button>
          </form>
        </div>
      </Block>
    </div>
  );
}
