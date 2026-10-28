import { Card } from "@/components/ui/card";
import { CONSISTENCY_LABEL, type AnalysisResult } from "@/tools/iat/analysis/schema";

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

/** Conclusiones redactadas por la IA (las cifras oficiales están en tablas y gráficas). */
export function AnalysisView({ result }: { result: AnalysisResult }) {
  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h3 className="font-medium">Resumen ejecutivo</h3>
        <p className="text-sm leading-relaxed">{result.executiveSummary}</p>
      </Card>

      {result.findings.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {result.findings.map((f) => (
            <Card key={f.dimension} className="space-y-1.5">
              <p className="text-xs font-semibold text-muted">{f.dimension}</p>
              <h4 className="font-medium">{f.headline}</h4>
              <p className="text-sm leading-relaxed">{f.interpretation}</p>
            </Card>
          ))}
        </div>
      ) : null}

      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">Implícito vs. explícito</h3>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-heading">{CONSISTENCY_LABEL[result.implicitVsExplicit.consistency]}</span>
        </div>
        <p className="text-sm leading-relaxed">{result.implicitVsExplicit.summary}</p>
      </Card>

      {result.segments.length ? (
        <Card className="space-y-2">
          <h3 className="font-medium">Segmentos</h3>
          <ul className="space-y-2 text-sm">
            {result.segments.map((s) => (
              <li key={s.variable}>
                <strong>{s.variable}:</strong> {s.insight}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {result.deviceNote ? (
        <Card className="space-y-1">
          <h3 className="font-medium">Dispositivos</h3>
          <p className="text-sm leading-relaxed">{result.deviceNote}</p>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="space-y-2">
          <h3 className="font-medium">Limitaciones</h3>
          <List items={result.limitations} />
        </Card>
        <Card className="space-y-2">
          <h3 className="font-medium">Recomendaciones</h3>
          <List items={result.recommendations} />
        </Card>
      </div>
    </div>
  );
}
