import { deleteStudy, regenerateLink } from "@/app/(app)/studies/[id]/actions";
import { CopyLink } from "@/components/copy-link";
import { DuplicateStudyForm } from "@/components/duplicate-study-form";
import { StudyHeader } from "@/components/study-header";
import { StudySettingsForm } from "@/components/study-settings-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import type { StudyRow } from "@/lib/db/types";
import { getInstrument, listItems, surveyConfigSchema } from "../engine";

const STATUS_LABEL = {
  draft: "Borrador",
  published: "Publicado",
  closed: "Cerrado",
} as const;

/** Resumen de una encuesta: liga mágica, diseño, ajustes de la liga y zona de riesgo. */
export function SurveyOverview({
  study,
  projectName,
  link,
  created,
  copied = false,
}: {
  study: StudyRow;
  projectName: string | null;
  link: string;
  created: boolean;
  copied?: boolean;
}) {
  const config = surveyConfigSchema.safeParse(study.config);
  const items = config.success ? listItems(config.data) : [];

  return (
    <div className="space-y-8">
      <StudyHeader
        study={study}
        projectName={projectName}
        active="overview"
        variant="survey"
        subtitle={STATUS_LABEL[study.status]}
      />

      {copied ? <Alert>Copia creada en borrador. Revisa la configuración y publícala en Ajustes.</Alert> : null}

      {created ? (
        <Alert>
          ¡Encuesta generada! Comparte la liga con tus participantes.
        </Alert>
      ) : null}

      <Card className="space-y-3">
        <div>
          <SectionTitle icon="link">Liga mágica</SectionTitle>
          <p className="text-sm text-muted">
            Comparte esta liga con tantos participantes como necesites. No
            requiere cuenta ni contraseña.
          </p>
        </div>
        <CopyLink url={link} />
        <a
          href={`${link}?preview=1`}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm font-medium text-heading underline underline-offset-4"
        >
          Abrir vista previa (no guarda datos) ↗
        </a>
        {study.status !== "published" ? (
          <Alert tone="warning">
            La liga está inactiva porque el estudio está en estado «
            {STATUS_LABEL[study.status].toLowerCase()}».
          </Alert>
        ) : null}
      </Card>

      {config.success ? (
        <Card className="space-y-3">
          <SectionTitle icon="survey">Diseño de la encuesta</SectionTitle>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
            <dt className="text-muted">Título</dt>
            <dd>{config.data.title}</dd>
            <dt className="text-muted">Bloques</dt>
            <dd>
              <ol className="list-decimal space-y-1 pl-5">
                {config.data.blocks.map((b) => (
                  <li key={b.id}>
                    {b.kind === "instrument" ? (
                      <>
                        {getInstrument(b.instrumentId).name}
                        {b.subject ? (
                          <span className="text-muted"> · {b.subject}</span>
                        ) : null}
                      </>
                    ) : b.kind === "price" ? (
                      <>
                        {b.method === "van_westendorp" ? "Van Westendorp (sensibilidad al precio)" : "Gabor-Granger (curva de demanda)"}
                        {b.subject ? <span className="text-muted"> · {b.subject}</span> : null}
                      </>
                    ) : (
                      <>
                        {b.questions.length}{" "}
                        {b.questions.length === 1 ? "pregunta" : "preguntas"}
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </dd>
            <dt className="text-muted">Elementos</dt>
            <dd>{items.length} en total</dd>
          </dl>
        </Card>
      ) : (
        <Alert tone="warning">
          La configuración guardada de este estudio no es válida.
        </Alert>
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
        <SectionTitle icon="alert" className="text-danger">Zona de riesgo</SectionTitle>
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
      </Card>
    </div>
  );
}
