import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { setParticipantExcluded } from "../../actions";
import { Button } from "@/components/ui/button";
import { SurveyResultsView } from "@/tools/survey/ui/results-view";
import type { BatteryReport, CorrelationReport, ReportStep } from "../report";

const nf = (d: number) =>
  new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
const num = (n: number | null, d = 2) => (n === null ? "—" : nf(d).format(n));
const range = (r: [number, number] | null, d = 2) =>
  r ? `${num(r[0], d)} a ${num(r[1], d)}` : "—";
const pValue = (p: number | null) =>
  p === null ? "—" : p < 0.001 ? "< 0,001" : nf(3).format(p);

/** Etiqueta de evidencia: qué tan directamente sale del participante. */
function EvidenceBadge({ kind }: { kind: "medido" | "estimado" }) {
  const hint =
    kind === "medido"
      ? "Lo que el participante hizo o contestó"
      : "Estadístico inferido de la muestra; depende de cuántos participantes haya";
  return (
    <span
      title={hint}
      className="rounded-full border border-border px-2 py-0.5 text-xs text-muted"
    >
      {kind}
    </span>
  );
}

function Section({
  title,
  evidence,
  children,
}: {
  title: string;
  evidence?: "medido" | "estimado";
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {evidence ? <EvidenceBadge kind={evidence} /> : null}
      </div>
      {children}
    </section>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="py-1 pr-4 font-medium">{children}</th>;
}

function CorrelationRow({ c }: { c: CorrelationReport }) {
  return (
    <tr className="border-t border-border align-top">
      <td className="py-1.5 pr-4">
        {c.implicit.label}
        <span className="text-muted"> ↔ </span>
        {c.explicit.label}
      </td>
      <td className="py-1.5 pr-4 tabular-nums">{c.n}</td>
      <td className="py-1.5 pr-4 tabular-nums">{num(c.rho)}</td>
      <td className="py-1.5 pr-4 tabular-nums">{range(c.ci95)}</td>
      <td className="py-1.5 pr-4 tabular-nums">{pValue(c.p)}</td>
      <td className="py-1.5 pr-4 tabular-nums">{pValue(c.pAdjusted)}</td>
      <td className="py-1.5 pr-4 text-xs text-muted">
        {c.exploratory ? "Exploratoria" : ""}
      </td>
    </tr>
  );
}

/**
 * Informe integrado de una batería: IAT y variantes medidos, encuestas medidas, exposición (quién vio
 * las piezas y la lectura de la IA) y cruces estimados.
 */
export function ReportView({
  batteryId,
  report,
  steps,
  unreadable,
}: {
  batteryId: string;
  report: BatteryReport;
  steps: ReportStep[];
  unreadable: string[];
}) {
  const surveyConfigs = new Map(
    steps.flatMap((s) => (s.kind === "survey" ? [[s.studyId, s.config]] : [])),
  );

  return (
    <div className="space-y-8">
      <Card>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-muted">
              Participantes que terminaron
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {report.nParticipants}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">
              En el análisis
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {report.nIncluded}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">
              Excluidos
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {report.nExcluded}
            </dd>
          </div>
        </dl>
      </Card>

      {unreadable.length ? (
        <Alert tone="warning">
          No se pudo leer la configuración de: {unreadable.join(", ")}. Esos
          pasos no aparecen en el informe.
        </Alert>
      ) : null}
      {report.nParticipants === 0 ? (
        <Alert>
          Aún no hay participantes que hayan terminado todos los pasos. El
          informe se llena conforme terminan.
        </Alert>
      ) : null}
      {report.notes.map((n) => (
        <Alert key={n} tone="warning">
          {n}
        </Alert>
      ))}

      {report.iat.length ? (
        <Section title="Medidas implícitas (IAT)" evidence="medido">
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-semibold text-muted">
                <tr>
                  <Th>Dimensión</Th>
                  <Th>n</Th>
                  <Th>D medio</Th>
                  <Th>IC95 %</Th>
                  <Th>p</Th>
                  <Th>Lectura</Th>
                </tr>
              </thead>
              <tbody>
                {report.iat.map((d) => (
                  <tr
                    key={`${d.stepId}:${d.dimensionId}`}
                    className="border-t border-border align-top"
                  >
                    <td className="py-1.5 pr-4">
                      {d.stepName} · {d.dimensionName}
                    </td>
                    <td className="py-1.5 pr-4 tabular-nums">
                      {d.n}
                      {d.nInvalid ? (
                        <span
                          className="text-muted"
                          title="Participantes cuyo resultado no es válido o falta"
                        >
                          {" "}
                          (+{d.nInvalid} sin D válido)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-4 tabular-nums">{num(d.mean)}</td>
                    <td className="py-1.5 pr-4 tabular-nums">
                      {range(d.ci95)}
                    </td>
                    <td className="py-1.5 pr-4 tabular-nums">{pValue(d.p)}</td>
                    <td className="py-1.5 pr-4">{d.reading ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      ) : null}

      {report.variants.length ? (
        <Section title="Variantes del IAT" evidence="medido">
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-semibold text-muted">
                <tr>
                  <Th>Prueba</Th>
                  <Th>n</Th>
                  <Th>Medida media</Th>
                  <Th>IC95 %</Th>
                  <Th>p</Th>
                  <Th>Cómo leerla</Th>
                </tr>
              </thead>
              <tbody>
                {report.variants.map((v) => (
                  <tr
                    key={v.stepId}
                    className="border-t border-border align-top"
                  >
                    <td className="py-1.5 pr-4">
                      {v.stepName} · {v.measure}
                    </td>
                    <td className="py-1.5 pr-4 tabular-nums">
                      {v.n}
                      {v.nInvalid ? (
                        <span
                          className="text-muted"
                          title="Participantes cuyo resultado no es válido o falta"
                        >
                          {" "}
                          (+{v.nInvalid} sin resultado válido)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-4 tabular-nums">
                      {num(v.mean)} {v.mean === null ? "" : v.unit}
                    </td>
                    <td className="py-1.5 pr-4 tabular-nums">
                      {range(v.ci95)}
                    </td>
                    <td className="py-1.5 pr-4 tabular-nums">{pValue(v.p)}</td>
                    <td className="py-1.5 pr-4 text-muted">
                      0 = {v.zeroMeans}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      ) : null}

      {report.exposures.map((e) => (
        <Section key={e.stepId} title={`Exposición · ${e.stepName}`}>
          <Card className="space-y-3">
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{e.nViewed}</span> de{" "}
              <span className="tabular-nums">{e.nIncluded}</span> participantes
              incluidos vieron las {e.pieces.length}{" "}
              {e.pieces.length === 1 ? "imagen" : "imágenes"} antes de las
              pruebas siguientes. <EvidenceBadge kind="medido" />
            </p>
            <p className="text-sm text-muted">
              Es un paso de exposición: garantiza que la persona vio el
              estímulo; no mide hacia dónde miró.
            </p>
          </Card>
          {e.pieces.some((p) => p.criteria) ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">Lectura de la IA de cada imagen</h3>
                <EvidenceBadge kind="estimado" />
              </div>
              <Card className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs font-semibold text-muted">
                    <tr>
                      <Th>Imagen</Th>
                      {(e.pieces.find((p) => p.criteria)?.criteria ?? []).map(
                        (c) => (
                          <Th key={c.label}>{c.label}</Th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {e.pieces.map((p) => (
                      <tr
                        key={p.title}
                        className="border-t border-border align-top"
                      >
                        <td className="py-1.5 pr-4">{p.title}</td>
                        {p.criteria ? (
                          p.criteria.map((c) => (
                            <td
                              key={c.label}
                              className="py-1.5 pr-4 tabular-nums"
                            >
                              {c.score} / 5
                            </td>
                          ))
                        ) : (
                          <td className="py-1.5 pr-4 text-muted" colSpan={6}>
                            Sin análisis de IA todavía
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <p className="text-xs text-muted">
                Estimación experta de una IA sobre la imagen. No es eye tracking
                ni la reacción de personas reales; sirve para leerla junto a lo
                que sí midieron las otras pruebas.
              </p>
            </>
          ) : null}
        </Section>
      ))}

      {report.surveys.map((s) => {
        const config = surveyConfigs.get(s.stepId);
        return config ? (
          <Section
            key={s.stepId}
            title={`Encuesta · ${s.stepName}`}
            evidence="medido"
          >
            <SurveyResultsView config={config} aggregates={s.aggregates} />
          </Section>
        ) : null;
      })}

      <Section
        title="Cruces entre lo implícito y lo declarado"
        evidence="estimado"
      >
        {report.correlations.length ? (
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-semibold text-muted">
                <tr>
                  <Th>Par</Th>
                  <Th>n</Th>
                  <Th>ρ de Spearman</Th>
                  <Th>IC95 %</Th>
                  <Th>p</Th>
                  <Th>p ajustada</Th>
                  <Th>&nbsp;</Th>
                </tr>
              </thead>
              <tbody>
                {report.correlations.map((c) => (
                  <CorrelationRow
                    key={`${c.implicit.stepId}:${c.implicit.dimensionId}|${c.explicit.key}`}
                    c={c}
                  />
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <p className="text-sm text-muted">
            Todavía no hay datos suficientes para cruzar (se necesitan al menos
            10 participantes con ambos datos).
          </p>
        )}
        {report.skipped.length ? (
          <details className="text-sm text-muted">
            <summary className="cursor-pointer">
              {report.skipped.length} cruce
              {report.skipped.length === 1 ? "" : "s"} no calculado
              {report.skipped.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {report.skipped.map((s) => (
                <li key={`${s.implicit}|${s.explicit}`}>
                  {s.implicit} ↔ {s.explicit}:{" "}
                  {s.reason === "n_insufficient"
                    ? `solo ${s.n} participantes con ambos datos`
                    : "una de las dos medidas no varía"}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Section>

      {report.rows.length ? (
        <Section title="Participantes">
          <p className="text-sm text-muted">
            Excluir a alguien lo saca de los cálculos de este informe (no borra
            nada: sigue en la base y en el CSV con la marca). Hazlo con un
            criterio que puedas explicar, por ejemplo respuestas al azar.
          </p>
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-semibold text-muted">
                <tr>
                  <Th>Código</Th>
                  {report.iat.map((d) => (
                    <Th key={`${d.stepId}:${d.dimensionId}`}>
                      D · {d.dimensionName}
                    </Th>
                  ))}
                  {report.variants.map((v) => (
                    <Th key={v.stepId}>{v.measure}</Th>
                  ))}
                  {report.exposures.map((e) => (
                    <Th key={e.stepId}>Vio · {e.stepName}</Th>
                  ))}
                  {report.metrics.map((m) => (
                    <Th key={m.key}>{m.label}</Th>
                  ))}
                  <Th>Informe</Th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-border align-top ${r.excluded ? "opacity-60" : ""}`}
                  >
                    <td className="whitespace-nowrap py-1.5 pr-4 text-sm font-semibold tabular-nums">{r.ref}</td>
                    {report.iat.map((d) => (
                      <td
                        key={`${d.stepId}:${d.dimensionId}`}
                        className="py-1.5 pr-4 tabular-nums"
                      >
                        {num(r.d[`${d.stepId}:${d.dimensionId}`] ?? null)}
                      </td>
                    ))}
                    {report.variants.map((v) => (
                      <td key={v.stepId} className="py-1.5 pr-4 tabular-nums">
                        {num(r.d[`${v.stepId}:primary`] ?? null)}
                      </td>
                    ))}
                    {report.exposures.map((e) => (
                      <td key={e.stepId} className="py-1.5 pr-4">
                        {r.exposed[e.stepId] ? "Sí" : "No"}
                      </td>
                    ))}
                    {report.metrics.map((m) => (
                      <td key={m.key} className="py-1.5 pr-4 tabular-nums">
                        {num(r.metrics[m.key] ?? null, 1)}
                      </td>
                    ))}
                    <td className="py-1.5 pr-4">
                      <form
                        action={setParticipantExcluded}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="id" value={r.id} />
                        <input
                          type="hidden"
                          name="batteryId"
                          value={batteryId}
                        />
                        <input
                          type="hidden"
                          name="excluded"
                          value={r.excluded ? "false" : "true"}
                        />
                        {r.excluded ? null : (
                          <input
                            name="reason"
                            maxLength={200}
                            placeholder="Motivo (opcional)"
                            aria-label={`Motivo para excluir a ${r.ref}`}
                            className="h-8 w-40 rounded-md border border-control bg-background px-2 text-xs"
                          />
                        )}
                        <Button
                          type="submit"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                        >
                          {r.excluded ? "Reincorporar" : "Excluir"}
                        </Button>
                        {r.excluded ? (
                          <span className="text-xs text-muted">Excluido</span>
                        ) : null}
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>
      ) : null}

      <p className="text-xs text-muted">
        Versión del motor del informe: {report.engineVersion}
      </p>
    </div>
  );
}
