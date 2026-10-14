"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createBattery } from "@/app/(app)/batteries/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SectionTitle } from "@/components/ui/section-title";
import { defaultBatteryConsent, DEFAULT_BATTERY_THANK_YOU, orderWarnings } from "../engine/config";
import { infosOf, StepsEditor, type DraftStep, type StudyOption } from "./StepsEditor";

/** Constructor de baterías: elige estudios del proyecto, ordénalos y escribe los textos. */
export function BatteryBuilder({ projectId, projectName, studies }: { projectId: string; projectName: string; studies: StudyOption[] }) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [consent, setConsent] = useState(defaultBatteryConsent(""));
  const [consentEdited, setConsentEdited] = useState(false);
  const [thankYou, setThankYou] = useState(DEFAULT_BATTERY_THANK_YOU);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const blocking = orderWarnings(infosOf(steps, studies)).some((w) => w.level === "error");

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createBattery({ projectId, name, steps, texts: { consent, thankYou } });
      // En éxito el servidor redirige; sólo vuelve aquí si hubo un error.
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <SectionTitle icon="layers">Datos de la batería</SectionTitle>
        <Field label="Nombre de la batería" hint="Lo ves tú; el participante verá este nombre como título de la actividad.">
          <Input
            value={name}
            maxLength={160}
            placeholder="Ej. Café de especialidad: implícito y explícito"
            onChange={(e) => {
              setName(e.target.value);
              if (!consentEdited) setConsent(defaultBatteryConsent(e.target.value));
            }}
          />
        </Field>
        <p className="text-xs text-muted">Proyecto: {projectName}</p>
      </Card>

      <Card className="space-y-4">
        <SectionTitle icon="target">Pasos</SectionTitle>
        <p className="text-sm text-muted">
          El participante recorre los estudios incluidos, en este orden, con una sola liga y un solo consentimiento. Cada estudio debe estar
          <strong> publicado</strong> y, para que el límite de respuestas sea el de la batería, sin límite propio.
        </p>
        <StepsEditor studies={studies} steps={steps} onChange={setSteps} />
      </Card>

      <Card className="space-y-4">
        <SectionTitle icon="chat">Textos para el participante</SectionTitle>
        <Field label="Consentimiento" hint="Se genera con el nombre; edítalo si lo necesitas. Tu equipo legal debe validarlo antes de usar la liga con personas reales.">
          <Textarea
            value={consent}
            onChange={(e) => {
              setConsent(e.target.value);
              setConsentEdited(true);
            }}
            rows={7}
            maxLength={4000}
          />
        </Field>
        <Field label="Mensaje de agradecimiento">
          <Textarea value={thankYou} onChange={(e) => setThankYou(e.target.value)} rows={3} maxLength={1000} />
        </Field>
      </Card>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex items-center justify-between gap-3">
        <Link href={`/projects/${projectId}`} className={buttonClass("ghost")}>
          Cancelar
        </Link>
        <Button type="button" onClick={submit} disabled={pending || steps.length === 0}>
          {pending ? "Creando…" : blocking ? "Crear como borrador" : "Crear batería"}
        </Button>
      </div>
    </div>
  );
}
