"use client";

import { useId, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/brand/icon";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import {
  blockInstructions,
  getInstrument,
  listPriceItems,
  priceInstructions,
  renderItemText,
  type InstrumentDef,
  type InstrumentItem,
} from "../engine";
import { INSTRUMENT_CATALOG, PRICE_CATALOG } from "./catalog";
import { parsePrices, type DraftBlock } from "./model";

type InstrumentBlock = Extract<DraftBlock, { kind: "instrument" }>;
type PriceBlock = Extract<DraftBlock, { kind: "price" }>;

/** Mensajes de validación de un bloque; vacío si no hay. */
function Problems({ problems }: { problems: string[] }) {
  if (!problems.length) return null;
  return (
    <ul className="space-y-1" role="alert">
      {problems.map((p) => (
        <li key={p} className="flex items-center gap-2 text-sm text-foreground">
          <Icon name="alert" className="size-5 text-danger" />
          {p}
        </li>
      ))}
    </ul>
  );
}

/**
 * Cabecera de un bloque: una banda teal que marca dónde empieza cada pantalla del participante
 * (el participante ve un bloque por pantalla). Agrupa sus tarjetas sin envolverlas en otra tarjeta.
 */
export function BlockSection({
  id,
  icon,
  title,
  index,
  count,
  onMove,
  onRemove,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      id={`sb-${id}`}
      aria-labelledby={headingId}
      className="scroll-mt-28 space-y-3"
    >
      <div className="flex items-center gap-3 rounded-lg bg-heading py-1.5 pl-4 pr-1.5 text-background">
        <Icon name={icon} className="size-6" />
        <h3
          id={headingId}
          className="min-w-0 flex-1 text-sm font-semibold leading-snug tracking-normal text-background"
        >
          Bloque {index + 1} · {title}
        </h3>
        <span
          className="hidden shrink-0 text-xs text-background/80 sm:inline"
          aria-hidden="true"
        >
          Pantalla {index + 1} de {count}
        </span>
        <div className="flex shrink-0">
          <IconButton
            onBand
            icon="chevron"
            rotate={180}
            label={`Subir bloque ${index + 1}`}
            onClick={() => onMove(-1)}
            disabled={index === 0}
          />
          <IconButton
            onBand
            icon="chevron"
            label={`Bajar bloque ${index + 1}`}
            onClick={() => onMove(1)}
            disabled={index === count - 1}
          />
          <IconButton
            onBand
            icon="trash"
            label={`Quitar bloque ${index + 1}`}
            onClick={onRemove}
          />
        </div>
      </div>
      {children}
    </section>
  );
}

const CARD = "space-y-4 rounded-lg border border-border bg-surface p-5";

/** Une los ítems consecutivos que repiten enunciado y sólo cambian de polos (diferencial semántico). */
function groupByStem(items: readonly InstrumentItem[]): InstrumentItem[][] {
  const groups: InstrumentItem[][] = [];
  for (const item of items) {
    const prev = groups.at(-1);
    if (
      prev &&
      prev[0]!.text === item.text &&
      item.minLabel &&
      item.maxLabel &&
      prev[0]!.minLabel &&
      prev[0]!.maxLabel
    )
      prev.push(item);
    else groups.push([item]);
  }
  return groups;
}

function PreviewBox({
  children,
  instructions,
}: {
  children: ReactNode;
  instructions?: string;
}) {
  return (
    <div className="space-y-3 rounded-md bg-primary/10 px-4 py-3 text-sm">
      <p className="text-xs text-muted">Así lo verá el participante</p>
      {instructions ? <p className="text-muted">{instructions}</p> : null}
      {children}
    </div>
  );
}

/** Fila de polos opuestos tal como se ve en la encuesta: palabras en los extremos y la escala debajo. */
function PoleRow({
  min,
  max,
  from,
  to,
}: {
  min: string;
  max: string;
  from: number;
  to: number;
}) {
  const points = Array.from({ length: to - from + 1 }, (_, i) => i);
  return (
    <div aria-hidden="true" className="space-y-1.5">
      <div className="flex justify-between gap-4 text-sm font-semibold text-heading">
        <span>{min}</span>
        <span className="text-right">{max}</span>
      </div>
      <div className="flex gap-1.5">
        {points.map((n) => (
          <span
            key={n}
            className="h-3 flex-1 rounded-full border border-heading/40"
          />
        ))}
      </div>
    </div>
  );
}

function InstrumentPreview({
  def,
  subject,
  instructions,
}: {
  def: InstrumentDef;
  subject: string;
  instructions?: string;
}) {
  const groups = groupByStem(def.items);
  const render = (group: InstrumentItem[]) =>
    group.length > 1 ? (
      <div className="space-y-2">
        <p className="font-medium">{renderItemText(group[0]!, subject)}</p>
        {group.map((item) => (
          <PoleRow
            key={item.n}
            min={item.minLabel!}
            max={item.maxLabel!}
            from={def.scale.min}
            to={def.scale.max}
          />
        ))}
      </div>
    ) : (
      <p>{renderItemText(group[0]!, subject)}</p>
    );
  return (
    <PreviewBox instructions={instructions}>
      {groups.length === 1 ? (
        render(groups[0]!)
      ) : (
        <ol className="list-decimal space-y-1 pl-5">
          {groups.map((g) => (
            <li key={g[0]!.n}>{render(g)}</li>
          ))}
        </ol>
      )}
    </PreviewBox>
  );
}

export function InstrumentCard({
  block,
  problems,
  onChange,
}: {
  block: InstrumentBlock;
  problems: string[];
  onChange: (patch: Partial<InstrumentBlock>) => void;
}) {
  const def = getInstrument(block.instrumentId);
  const meta = INSTRUMENT_CATALOG[block.instrumentId];
  const subject = block.subject.trim() || def.defaultSubject;
  return (
    <div className={CARD}>
      <p className="text-sm text-muted">
        {meta.blurb}{" "}
        {def.items.length === 1
          ? `Una pregunta, escala de ${def.scale.min} a ${def.scale.max}.`
          : `${def.items.length} preguntas, escala de ${def.scale.min} a ${def.scale.max}.`}
      </p>
      <Field
        label="Sobre qué se pregunta"
        hint={`Frase completa que sustituye al sujeto de los ítems. Ejemplo: «esta tienda en línea».`}
      >
        <Input
          value={block.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
          placeholder={def.defaultSubject}
          maxLength={80}
        />
      </Field>
      {!block.subject.trim() ? (
        <Alert tone="warning">
          Dile al participante de qué se trata. Si lo dejas vacío leerá «
          {def.defaultSubject}» sin saber a qué se refiere.
        </Alert>
      ) : null}
      <InstrumentPreview
        def={def}
        subject={subject}
        instructions={blockInstructions({
          kind: "instrument",
          id: block.id,
          instrumentId: block.instrumentId,
          required: block.required,
        })}
      />
      <p className="text-xs text-muted">
        {def.source} {def.notes}
      </p>
      <Problems problems={problems} />
      <div className="border-t border-border pt-3">
        <Switch
          label="Obligatorio"
          checked={block.required}
          onChange={(e) => onChange({ required: e.target.checked })}
        />
      </div>
    </div>
  );
}

function PricePreview({ block }: { block: PriceBlock }) {
  const gg = block.method === "gabor_granger";
  const prices = parsePrices(block.pricesText).filter(Number.isFinite);
  const engineBlock = {
    kind: "price" as const,
    id: block.id,
    method: block.method,
    subject: block.subject.trim() || undefined,
    currency: block.currency.trim() || undefined,
    prices: gg ? prices : undefined,
    required: block.required,
  };
  const first = listPriceItems(engineBlock)[0];
  return (
    <PreviewBox instructions={priceInstructions(engineBlock)}>
      {first ? (
        <div className="space-y-2">
          <p className="font-medium">{first.label}</p>
          {first.type === "number" ? (
            <p
              aria-hidden="true"
              className="flex w-48 items-center justify-between rounded-md border border-dashed border-heading/40 px-3 py-2 text-xs text-muted"
            >
              Escribe un número
              <span className="font-semibold text-heading">{first.unit}</span>
            </p>
          ) : (
            <p aria-hidden="true" className="flex gap-4 text-sm">
              <span>○ Sí</span>
              <span>○ No</span>
            </p>
          )}
        </div>
      ) : null}
    </PreviewBox>
  );
}

export function PriceCard({
  block,
  problems,
  onChange,
}: {
  block: PriceBlock;
  problems: string[];
  onChange: (patch: Partial<PriceBlock>) => void;
}) {
  const gg = block.method === "gabor_granger";
  const prices = parsePrices(block.pricesText).filter(Number.isFinite);
  const sorted = [...prices].sort((a, b) => a - b);
  return (
    <div className={CARD}>
      <p className="text-sm text-muted">{PRICE_CATALOG[block.method].blurb}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Sobre qué se pregunta"
          hint="Frase completa. Ejemplo: «esta suscripción mensual»."
        >
          <Input
            value={block.subject}
            onChange={(e) => onChange({ subject: e.target.value })}
            placeholder="este producto"
            maxLength={80}
          />
        </Field>
        <Field
          label="Moneda"
          hint="Sólo el código, como MXN o USD. No escribas un precio aquí."
        >
          <Input
            value={block.currency}
            onChange={(e) => onChange({ currency: e.target.value })}
            placeholder="MXN"
            maxLength={8}
          />
        </Field>
      </div>
      {gg ? (
        <div className="space-y-2">
          <Field
            label="Precios a probar"
            hint="Entre 3 y 10, separados por comas (decimales con punto). Se muestran de menor a mayor."
          >
            <Input
              value={block.pricesText}
              onChange={(e) => onChange({ pricesText: e.target.value })}
              placeholder="100, 150, 200, 250, 300"
            />
          </Field>
          {sorted.length ? (
            <ul
              aria-label="Orden en que se mostrarán"
              className="flex flex-wrap gap-1.5"
            >
              {sorted.map((p) => (
                <li
                  key={p}
                  className="rounded-full border border-border px-3 py-1 text-xs tabular-nums"
                >
                  {p} {block.currency.trim()}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <PricePreview block={block} />
      <p className="text-xs text-muted">
        {gg
          ? `El participante responde sí o no a cada uno de los ${prices.length} precios. `
          : "El participante escribe cuatro precios: muy barato, ganga, caro y demasiado caro. "}
        Es intención declarada: sobreestima la compra real y no es un pronóstico
        de ventas. Se recomiendan 100 respuestas o más.
      </p>
      <Problems problems={problems} />
      <div className="border-t border-border pt-3">
        <Switch
          label="Obligatorio"
          checked={block.required}
          onChange={(e) => onChange({ required: e.target.checked })}
        />
      </div>
    </div>
  );
}
