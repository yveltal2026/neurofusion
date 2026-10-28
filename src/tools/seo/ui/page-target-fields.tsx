"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { PageTarget } from "../config";

export function PageTargetFields({ targets = [] }: { targets?: PageTarget[] }) {
  const nextKey = useRef(targets.length);
  const [rows, setRows] = useState(() =>
    targets.map((target, key) => ({ ...target, key })),
  );
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="font-medium">Objetivos por página (opcional)</h3>
        <p className="mt-1 text-xs text-muted">
          Asigna una intención y una palabra clave a cada URL. Estas páginas
          tienen prioridad en el rastreo, dentro del límite elegido. La palabra
          clave general se usa en las páginas sin objetivo propio.
        </p>
      </div>
      {rows.map((row, i) => (
        <fieldset
          key={row.key}
          className="space-y-3 border-t border-border pt-3"
        >
          <legend className="pt-3 text-sm font-medium">Página {i + 1}</legend>
          <Field label={`URL objetivo ${i + 1}`}>
            <Input
              name="targetUrl"
              type="url"
              required
              defaultValue={row.url}
              placeholder="https://ejemplo.com/producto"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={`Palabra clave de la página ${i + 1}`}
              hint="Vacía: no comprobar coincidencias de palabras clave en esta página."
            >
              <Input
                name="pageKeyword"
                maxLength={80}
                defaultValue={row.keyword ?? ""}
              />
            </Field>
            <Field label={`Objetivo de la página ${i + 1}`}>
              <Input
                name="pageGoal"
                maxLength={300}
                defaultValue={row.goal}
                placeholder="Explicar el producto y facilitar una cotización"
              />
            </Field>
          </div>
          <Field label={`Visibilidad en buscadores de la página ${i + 1}`}>
            <select
              name="pageIndexing"
              defaultValue={row.indexable ? "index" : "exclude"}
              className="w-full rounded-md border border-control bg-background px-3 py-2 text-sm"
            >
              <option value="index">Debe poder aparecer en buscadores</option>
              <option value="exclude">Debe excluirse con noindex</option>
            </select>
          </Field>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setRows((all) => all.filter((r) => r.key !== row.key))
            }
          >
            Quitar objetivo de la página {i + 1}
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={rows.length >= 25}
        onClick={() => {
          const key = nextKey.current++;
          setRows((all) => [
            ...all,
            { key, url: "", keyword: null, goal: "", indexable: true },
          ]);
        }}
      >
        Añadir objetivo por URL
      </Button>
      <p className="text-xs text-muted">
        Hasta 25 objetivos. Se guardan con cada auditoría para conservar el
        contexto del diagnóstico.
      </p>
    </div>
  );
}
