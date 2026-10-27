"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { GENDER_OPTIONS, NEUTRAL_OPTION_LABEL, type IatConfig } from "../config";
import { cryptoRng, shuffle } from "../engine/rng";
import { buildParticipantSchema } from "../participant";

type Values = Record<string, string | string[]>;

const str = (v: string | string[] | undefined): string => (typeof v === "string" ? v : "");
const list = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : []);

const SELECT_CLASS = "h-10 w-full rounded-md border border-control bg-background px-3 text-sm";

/** Convierte lo tecleado en el payload tipado que espera el esquema (omite vacíos). */
function toPayload(config: IatConfig, v: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (v.explicit) out.explicit = v.explicit;
  if (config.participant.collectAge && str(v.age).trim()) out.age = Number(v.age);
  if (config.participant.collectGender && v.gender) out.gender = v.gender;
  for (const f of config.participant.extraFields) {
    if (f.type === "multiselect") {
      const picked = list(v[f.id]);
      if (picked.length) out[f.id] = picked;
      continue;
    }
    const raw = str(v[f.id]).trim();
    if (!raw) continue;
    out[f.id] = f.type === "number" || f.type === "likert" ? Number(raw) : raw;
  }
  return out;
}

export function ParticipantForm({
  config,
  submitting,
  error,
  onSubmit,
}: {
  config: IatConfig;
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [values, setValues] = useState<Values>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Orden aleatorio de las dos marcas para no sesgar la respuesta por posición.
  const [order] = useState<("A" | "B")[]>(() => shuffle(["A", "B"] as const, cryptoRng()));
  const set = (key: string, value: string | string[]) => setValues((v) => ({ ...v, [key]: value }));
  const toggle = (key: string, option: string) => {
    const current = list(values[key]);
    set(key, current.includes(option) ? current.filter((o) => o !== option) : [...current, option]);
  };
  const { participant } = config;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = toPayload(config, values);
    const parsed = buildParticipantSchema(config).safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        errs[key] ??= issue.message;
      }
      // Campos obligatorios vacíos llegan como "Required"; los mostramos en español.
      for (const k of Object.keys(errs)) if (/required|undefined/i.test(errs[k])) errs[k] = "Campo obligatorio";
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    onSubmit(parsed.data);
  }

  const err = (key: string) => (fieldErrors[key] ? <p className="text-sm text-danger">{fieldErrors[key]}</p> : null);

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <h2 className="text-xl font-semibold tracking-tight">Antes de empezar</h2>
      {error ? <Alert tone="error">{error}</Alert> : null}

      {participant.collectAge ? (
        <div>
          <Field label="Edad (opcional)">
            <Input type="number" inputMode="numeric" min={10} max={120} value={str(values.age)} onChange={(e) => set("age", e.target.value)} />
          </Field>
          {err("age")}
        </div>
      ) : null}

      {participant.collectGender ? (
        <div>
          <Field label="Género (opcional)">
            <select className={SELECT_CLASS} value={str(values.gender)} onChange={(e) => set("gender", e.target.value)}>
              <option value="">—</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
          {err("gender")}
        </div>
      ) : null}

      {participant.extraFields.map((f) => {
        const label = `${f.label}${f.required ? "" : " (opcional)"}`;
        if (f.type === "multiselect") {
          const picked = list(values[f.id]);
          return (
            <fieldset key={f.id} className="space-y-2">
              <legend className="text-sm font-medium">{label}</legend>
              <p className="text-xs text-muted">Puedes elegir varias opciones.</p>
              {f.options.map((o) => (
                <label key={o} className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="checkbox" checked={picked.includes(o)} onChange={() => toggle(f.id, o)} />
                  {o}
                </label>
              ))}
              {err(f.id)}
            </fieldset>
          );
        }
        if (f.type === "likert") {
          const points = Array.from({ length: f.points }, (_, i) => i + 1);
          return (
            <fieldset key={f.id} className="space-y-2">
              <legend className="text-sm font-medium">{label}</legend>
              <div className="flex flex-wrap gap-2">
                {points.map((n) => (
                  <label
                    key={n}
                    className="flex size-11 cursor-pointer items-center justify-center rounded-md border border-border text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40"
                  >
                    <input
                      type="radio"
                      name={f.id}
                      value={n}
                      checked={values[f.id] === String(n)}
                      onChange={() => set(f.id, String(n))}
                      className="sr-only"
                      aria-label={`${n}${n === 1 && f.minLabel ? ` (${f.minLabel})` : n === f.points && f.maxLabel ? ` (${f.maxLabel})` : ""}`}
                    />
                    {n}
                  </label>
                ))}
              </div>
              {f.minLabel || f.maxLabel ? (
                <div className="flex justify-between gap-4 text-xs text-muted">
                  <span>1 = {f.minLabel ?? ""}</span>
                  <span className="text-right">
                    {f.points} = {f.maxLabel ?? ""}
                  </span>
                </div>
              ) : null}
              {err(f.id)}
            </fieldset>
          );
        }
        return (
          <div key={f.id}>
            <Field label={label}>
              {f.type === "select" ? (
                <select className={SELECT_CLASS} value={str(values[f.id])} onChange={(e) => set(f.id, e.target.value)}>
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type={f.type === "number" ? "number" : "text"}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  value={str(values[f.id])}
                  onChange={(e) => set(f.id, e.target.value)}
                />
              )}
            </Field>
            {err(f.id)}
          </div>
        );
      })}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{participant.explicitQuestion}</legend>
        {[...order, "neutral" as const].map((key) => {
          const label = key === "A" ? config.conceptA.label : key === "B" ? config.conceptB.label : NEUTRAL_OPTION_LABEL;
          return (
            <label key={key} className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="explicit" value={key} checked={values.explicit === key} onChange={() => set("explicit", key)} />
              {label}
            </label>
          );
        })}
        {err("explicit")}
      </fieldset>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Preparando…" : "Continuar"}
      </Button>
    </form>
  );
}
