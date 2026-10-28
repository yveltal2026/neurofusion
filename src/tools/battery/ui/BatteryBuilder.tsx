"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { createBattery } from "../actions";
import {
  batteryConfigSchema,
  defaultBatteryConsentText,
  DEFAULT_BATTERY_THANK_YOU,
  validateComposition,
  type BatteryStep,
} from "../engine";
import { StepsEditor, type AvailableStudy } from "./StepsEditor";

/** Alta de una batería: textos para el participante + pasos (orden sugerido, editable, con pasos omitibles). */
export function BatteryBuilder({
  projectId,
  projectName,
  available,
}: {
  projectId: string;
  projectName: string;
  available: AvailableStudy[];
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [consent, setConsent] = useState(defaultBatteryConsentText(""));
  const [consentEdited, setConsentEdited] = useState(false);
  const [thankYou, setThankYou] = useState(DEFAULT_BATTERY_THANK_YOU);
  const [steps, setSteps] = useState<BatteryStep[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeTitle(value: string) {
    setTitle(value);
    // Mientras el consentimiento no se haya editado a mano, sigue al título.
    if (!consentEdited) setConsent(defaultBatteryConsentText(value.trim()));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found: string[] = [];
    if (!name.trim()) found.push("Escribe un nombre para la batería");
    const config = batteryConfigSchema.safeParse({
      version: 1,
      title: title.trim(),
      intro: intro.trim() || undefined,
      texts: { consent: consent.trim(), thankYou: thankYou.trim() },
    });
    if (!config.success) {
      for (const issue of config.error.issues) {
        const where =
          issue.path[0] === "title"
            ? "Título"
            : issue.path[1] === "consent"
              ? "Consentimiento"
              : issue.path[1] === "thankYou"
                ? "Mensaje de agradecimiento"
                : "Introducción";
        found.push(`${where}: ${issue.message}`);
      }
    }
    found.push(...validateComposition(steps));
    if (found.length || !config.success) {
      setErrors(found);
      return;
    }
    setErrors([]);
    startTransition(async () => {
      const res = await createBattery({
        projectId,
        name,
        config: config.data,
        steps: steps.map((s) => ({ studyId: s.studyId, enabled: s.enabled })),
      });
      // En éxito la acción redirige; sólo vuelve aquí si hubo un error.
      if (res?.error) setServerError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <p className="text-sm text-muted">
        Proyecto: {projectName}. Una batería une estudios de este proyecto (IAT,
        variantes del IAT, encuestas e imágenes con IA) en una sola liga: el
        participante da un consentimiento y los recorre uno tras otro. Las
        imágenes se muestran como estímulo antes de las pruebas.
      </p>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">Datos básicos</h2>
        <Field label="Nombre de la batería" hint="Sólo lo ves tú.">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
          />
        </Field>
        <Field label="Título para el participante">
          <Input
            value={title}
            onChange={(e) => changeTitle(e.target.value)}
            maxLength={160}
          />
        </Field>
        <Field
          label="Introducción (opcional)"
          hint="Se muestra antes del consentimiento."
        >
          <Textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={3}
            maxLength={2000}
          />
        </Field>
      </Card>

      <section className="space-y-3" aria-label="Pasos">
        <h2 className="text-xl font-semibold">Pasos</h2>
        <p className="text-sm text-muted">
          El participante hace los pasos activos en este orden. La plataforma
          sugiere un orden, pero tú decides: puedes intercambiar pasos u omitir
          los que no necesites.
        </p>
        <StepsEditor steps={steps} onChange={setSteps} available={available} />
      </section>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">Textos para el participante</h2>
        <Field
          label="Consentimiento"
          hint="Se genera con el título; edítalo si lo necesitas. Cubre toda la batería: los pasos no piden otro. Tu equipo legal debe validarlo antes de usar la liga con personas reales."
        >
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
          <Textarea
            value={thankYou}
            onChange={(e) => setThankYou(e.target.value)}
            rows={3}
            maxLength={1000}
          />
        </Field>
      </Card>

      {errors.length ? (
        <Alert tone="error">
          <p className="font-medium">Revisa lo siguiente:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.map((er) => (
              <li key={er}>{er}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {serverError ? <Alert tone="error">{serverError}</Alert> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear batería y generar liga"}
      </Button>
    </form>
  );
}
