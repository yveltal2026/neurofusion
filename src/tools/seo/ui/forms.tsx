"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  createSeoStudy,
  generateSeoPlan,
  runSeoLiveAudit,
  runSeoUploadAudit,
  updateSeoConfig,
  type SeoFormState,
} from "../actions";
import type { SeoConfig } from "../config";

const initial: SeoFormState = {};
const select = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function SeoConfigFields({ config }: { config?: SeoConfig }) {
  return (
    <div className="space-y-4">
      <Field label="URL del sitio" hint="Página de inicio o la sección que quieres auditar.">
        <Input name="siteUrl" type="url" required placeholder="https://www.ejemplo.com.mx" defaultValue={config?.siteUrl} />
      </Field>
      <Field label="URLs adicionales (opcional)" hint="Una por línea: fichas de producto, categorías, landing pages. Máximo 20.">
        <Textarea name="extraUrls" placeholder={"https://www.ejemplo.com.mx/categoria\nhttps://www.ejemplo.com.mx/producto-123"} defaultValue={config?.extraUrls.join("\n")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Páginas a rastrear" hint="1–25. Más páginas = más tiempo.">
          <Input name="maxPages" type="number" min={1} max={25} defaultValue={config?.maxPages ?? 10} />
        </Field>
        <Field label="Palabra clave objetivo (opcional)">
          <Input name="targetKeyword" maxLength={80} placeholder="zapatos de piel" defaultValue={config?.targetKeyword ?? ""} />
        </Field>
        <Field label="Dispositivo para rendimiento">
          <select name="strategy" className={select} defaultValue={config?.strategy ?? "mobile"}>
            <option value="mobile">Móvil</option>
            <option value="desktop">Escritorio</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="checkPerformance" defaultChecked={config?.checkPerformance ?? true} />
        Medir Core Web Vitals con PageSpeed Insights (agrega ~30 s)
      </label>
    </div>
  );
}

export function NewSeoStudyForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(createSeoStudy, initial);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="Nombre del estudio">
        <Input name="name" required maxLength={160} placeholder="Auditoría SEO · Tienda X · oct 2026" />
      </Field>
      <SeoConfigFields />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear estudio"}
      </Button>
    </form>
  );
}

export function SeoSettingsForm({ studyId, config }: { studyId: string; config: SeoConfig }) {
  const [state, action, pending] = useActionState(updateSeoConfig, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="studyId" value={studyId} />
      <SeoConfigFields config={config} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok ? <Alert>Cambios guardados. Aplican a las próximas auditorías.</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

export function LiveAuditForm({ studyId }: { studyId: string }) {
  const [state, action, pending] = useActionState(runSeoLiveAudit, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="studyId" value={studyId} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Auditando… (hasta 90 s)" : "Auditar ahora"}
      </Button>
    </form>
  );
}

export function UploadAuditForm({ studyId }: { studyId: string }) {
  const [state, action, pending] = useActionState(runSeoUploadAudit, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="studyId" value={studyId} />
      <Field label="Archivos HTML" hint="En Chrome: clic derecho → «Ver código fuente» → Guardar como .html. Máx. 10 archivos de 1.5 MB.">
        <input name="files" type="file" accept=".html,.htm,text/html" multiple required className="block text-sm" />
      </Field>
      <Field label="URL de cada archivo" hint="Una por línea, en el mismo orden en que seleccionaste los archivos.">
        <Textarea name="urls" required placeholder="https://www.ejemplo.com.mx/" />
      </Field>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Analizando…" : "Auditar HTML subido"}
      </Button>
    </form>
  );
}

export function SeoPlanForm({ studyId, auditId, hasPlan }: { studyId: string; auditId: string; hasPlan: boolean }) {
  const [state, action, pending] = useActionState(generateSeoPlan, initial);
  return (
    <form action={action} className="space-y-3 print:hidden">
      <input type="hidden" name="studyId" value={studyId} />
      <input type="hidden" name="auditId" value={auditId} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Redactando… (puede tardar un minuto)" : hasPlan ? "Volver a generar el plan con IA" : "Generar plan de acción con IA"}
      </Button>
    </form>
  );
}
