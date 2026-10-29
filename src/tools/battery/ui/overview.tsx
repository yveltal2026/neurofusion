import { Breadcrumbs, projectCrumbs } from "@/components/ui/breadcrumbs";
import Link from "next/link";
import { CopyLink } from "@/components/copy-link";
import { StudySettingsForm } from "@/components/study-settings-form";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Block, Card, Panel } from "@/components/ui/card";
import {
  deleteBattery,
  duplicateBattery,
  regenerateBatteryLink,
  updateBatterySettings,
} from "../actions";
import type { BatteryDetail } from "../load";
import { summarizeBattery } from "../engine";
import { BatteryStepsPanel } from "./BatteryStepsPanel";
import { TOOL_LABEL, type AvailableStudy } from "./StepsEditor";
import { BatteryTabs } from "@/components/battery-tabs";

const STATUS_LABEL = {
  draft: "Borrador",
  published: "Publicado",
  closed: "Cerrado",
} as const;
const SESSION_LABEL = {
  started: "En curso",
  completed: "Completó",
  abandoned: "Abandonó",
} as const;
const STEP_MARK = { completed: "✓", in_progress: "…", pending: "·" } as const;
const STEP_TEXT = {
  completed: "completado",
  in_progress: "en curso",
  pending: "pendiente",
} as const;

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  });

/** Resumen de una batería: liga, participantes por paso, pasos, ajustes y zona de riesgo. */
export function BatteryOverview({
  detail,
  available,
  projectName,
  link,
  created,
  duplicated,
}: {
  detail: BatteryDetail;
  available: AvailableStudy[];
  projectName: string | null;
  link: string;
  created: boolean;
  duplicated: boolean;
}) {
  const { battery, steps, sessions, children } = detail;
  const summary = summarizeBattery(
    steps.filter((s) => s.enabled).map((s) => s.studyId),
    sessions,
    children,
  );
  const names = new Map(steps.map((s) => [s.studyId, s.name]));
  const locked = sessions.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Breadcrumbs items={projectCrumbs(battery.project_id, projectName)} />
          <h1 className="mt-1 break-words text-3xl font-bold tracking-tight">
            {battery.name}
          </h1>
          <p className="mt-1 text-xs text-muted">
            <span className="font-display font-semibold text-neuro-ink">Batería</span> ·{" "}
            {STATUS_LABEL[battery.status]}
          </p>
        </div>
        <Link
          href={`/batteries/${battery.id}/report`}
          className={buttonClass("secondary")}
        >
          Informe integrado
        </Link>
      </div>

      <BatteryTabs id={battery.id} active="overview" />
      {created ? (
        <Alert>
          ¡Batería generada! Comparte la liga con tus participantes.
        </Alert>
      ) : null}
      {duplicated ? (
        <Alert>
          Copia creada como borrador. Ajusta sus pasos y publícala cuando esté
          lista.
        </Alert>
      ) : null}
      {!detail.config ? (
        <Alert tone="warning">
          La configuración guardada de esta batería no es válida.
        </Alert>
      ) : null}

      <Panel className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Liga mágica</h2>
          <p className="text-sm text-muted">
            Una sola liga para toda la batería. No requiere cuenta ni
            contraseña.
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
        {battery.status !== "published" ? (
          <Alert tone="warning">
            La liga está inactiva porque la batería está en estado «
            {STATUS_LABEL[battery.status].toLowerCase()}».
          </Alert>
        ) : null}
        <p className="text-xs text-muted">
          Las ligas individuales de cada paso siguen funcionando por separado,
          pero sus respuestas no cuentan como parte de esta batería.
        </p>
      </Panel>

      <section className="space-y-4" aria-label="Participantes">
        <h2 className="text-xl font-semibold">Participantes</h2>
        <Card>
          <dl className="grid gap-4 sm:grid-cols-4">
            {[
              ["Iniciaron", summary.total],
              ["Completaron", summary.completed],
              ["En curso", summary.inProgress],
              ["Abandonaron", summary.abandoned],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-semibold text-muted">
                  {label}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {summary.total > 0 ? (
          <>
            <Block className="space-y-3">
              <h3 className="text-lg font-semibold">Avance por paso</h3>
              <ul className="space-y-1 text-sm">
                {summary.byStep.map((s) => (
                  <li
                    key={s.studyId}
                    className="flex flex-wrap justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">
                      {names.get(s.studyId) ?? "Paso"}
                    </span>
                    <span className="tabular-nums text-muted">
                      {s.completed} completaron
                      {s.inProgress ? ` · ${s.inProgress} en curso` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Block>

            <Block className="space-y-3 overflow-x-auto">
              <h3 className="text-lg font-semibold">Últimos participantes</h3>
              <table className="w-full text-left text-sm">
                <thead className="text-xs font-semibold text-muted">
                  <tr>
                    <th className="py-1 pr-4 font-medium">Código</th>
                    <th className="py-1 pr-4 font-medium">Estado</th>
                    <th className="py-1 pr-4 font-medium">Pasos</th>
                    <th className="py-1 pr-4 font-medium">Inicio</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.participants.slice(0, 20).map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="whitespace-nowrap py-1.5 pr-4 text-sm font-semibold tabular-nums">
                        {p.participantRef}
                        {p.excluded ? (
                          <span className="ml-2 text-muted">(excluido)</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-4">{SESSION_LABEL[p.status]}</td>
                      <td className="py-1.5 pr-4">
                        <span className="inline-flex gap-1">
                          {p.steps.map((x) => (
                            <span
                              key={x.studyId}
                              title={`${names.get(x.studyId) ?? "Paso"}: ${STEP_TEXT[x.status]}`}
                              aria-label={`${names.get(x.studyId) ?? "Paso"}: ${STEP_TEXT[x.status]}`}
                              className="inline-flex size-6 items-center justify-center rounded border border-border text-xs"
                            >
                              {STEP_MARK[x.status]}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="py-1.5 pr-4 text-muted">
                        {dateTime(p.startedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.participants.length > 20 ? (
                <p className="text-xs text-muted">
                  Se muestran los 20 más recientes de {summary.total}.
                </p>
              ) : null}
            </Block>
          </>
        ) : null}
      </section>

      <section className="space-y-3" aria-label="Pasos">
        <h2 className="text-xl font-semibold">Pasos</h2>
        {locked ? (
          <Alert tone="info">
            Esta batería ya tiene participantes, así que sus pasos no se pueden
            cambiar: mezclar muestras que corrieron en órdenes distintos
            invalidaría la comparación. Para probar otro orden o quitar pasos,{" "}
            <strong>duplica la batería</strong>.
          </Alert>
        ) : (
          <p className="text-sm text-muted">
            El participante hace los pasos activos en este orden. Puedes
            intercambiarlos u omitir los que no necesites mientras nadie haya
            participado.
          </p>
        )}
        <BatteryStepsPanel
          batteryId={battery.id}
          initialSteps={steps}
          available={available}
          locked={locked}
        />
        {steps.map((s) => (
          <span key={s.studyId} className="sr-only">
            {TOOL_LABEL[s.toolType]}: {s.name}
          </span>
        ))}
      </section>

      <Block className="space-y-4">
        <h2 className="text-xl font-semibold">Ajustes</h2>
        <StudySettingsForm
          id={battery.id}
          status={battery.status}
          maxResponses={battery.max_responses}
          closesAt={battery.closes_at}
          duplicatePolicy={battery.duplicate_policy}
          action={updateBatterySettings}
        />
      </Block>

      <Block className="space-y-4 border-danger/30">
        <h2 className="text-xl font-semibold text-danger">Zona de riesgo</h2>
        <div className="flex flex-wrap gap-3">
          <form action={duplicateBattery}>
            <input type="hidden" name="id" value={battery.id} />
            <Button type="submit" variant="secondary">
              Duplicar batería
            </Button>
          </form>
          <form action={regenerateBatteryLink}>
            <input type="hidden" name="id" value={battery.id} />
            <Button type="submit" variant="secondary">
              Regenerar liga (invalida la actual)
            </Button>
          </form>
          <form action={deleteBattery}>
            <input type="hidden" name="id" value={battery.id} />
            <Button type="submit" variant="danger">
              Eliminar batería y sus datos
            </Button>
          </form>
        </div>
        <p className="text-xs text-muted">
          Eliminar la batería borra sus participantes y las respuestas de los
          pasos ligadas a ellos. Los estudios de los pasos no se borran.
        </p>
      </Block>
    </div>
  );
}
