"use client";

import { useActionState, useSyncExternalStore } from "react";
import { updateStudySettings, type SettingsState } from "@/app/(app)/studies/[id]/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { DuplicatePolicy, StudyStatus } from "@/lib/db/types";

const initial: SettingsState = {};

/** ISO (UTC) → valor de <input type="datetime-local"> en la zona del navegador. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StudySettingsForm({
  id,
  status,
  maxResponses,
  closesAt,
  duplicatePolicy,
  action: saveAction = updateStudySettings,
}: {
  /** Acción que guarda los ajustes; por defecto la de estudios (las baterías pasan la suya). */
  action?: (prev: SettingsState, formData: FormData) => Promise<SettingsState>;
  id: string;
  status: StudyStatus;
  maxResponses: number | null;
  closesAt: string | null;
  duplicatePolicy: DuplicatePolicy;
}) {
  const [state, action, pending] = useActionState(saveAction, initial);
  // La zona horaria sólo se conoce en el navegador: en servidor el snapshot es "" y en cliente el valor
  // local; al cambiar, `key` remonta el input con su defaultValue sin desajustar la hidratación.
  const localClose = useSyncExternalStore(
    () => () => {},
    () => toLocalInput(closesAt),
    () => "",
  );

  // La fecha local del navegador se convierte a ISO (UTC) antes de enviarla al servidor.
  function submit(formData: FormData) {
    const local = String(formData.get("closes_local") ?? "");
    formData.set("closes_at", local ? new Date(local).toISOString() : "");
    return action(formData);
  }

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.saved ? <Alert>Cambios guardados.</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Estado de la liga" hint="Sólo los estudios «publicados» aceptan participantes.">
          <select name="status" defaultValue={status} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
            <option value="published">Publicado (acepta respuestas)</option>
            <option value="closed">Cerrado</option>
            <option value="draft">Borrador (liga inactiva)</option>
          </select>
        </Field>
        <Field label="Límite de respuestas (opcional)">
          <Input name="max_responses" type="number" min={1} step={1} defaultValue={maxResponses ?? ""} placeholder="Sin límite" />
        </Field>
        <Field label="Fecha y hora de cierre (opcional)" hint="Pasada esta fecha la liga deja de aceptar respuestas.">
          <Input key={localClose} name="closes_local" type="datetime-local" defaultValue={localClose} />
        </Field>
        <Field label="Candado contra participación repetida">
          <select name="duplicate_policy" defaultValue={duplicatePolicy} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
            <option value="device_cookie">Cookie de dispositivo (recomendado)</option>
            <option value="device_cookie_and_ip">Cookie + marcar posibles duplicados por IP</option>
            <option value="none">Sin candado (pilotos y demos de clase)</option>
          </select>
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
