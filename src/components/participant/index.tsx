import type { ReactNode } from "react";
import type { IconName } from "@/components/brand/icon";
import { Logo } from "@/components/brand/logo";
import { IconTile } from "@/components/ui/icon-tile";
import { Tag } from "@/components/ui/tag";

/**
 * Kit visual de las pantallas que ve quien recibe una liga (encuesta, batería, exposición de imágenes,
 * eye tracking, errores). Una sola jerarquía para todas, pensada para leerse en un celular y sin ayuda:
 *   1. marca discreta arriba (quién pregunta),
 *   2. etiqueta de contexto («Parte 2 de 3») + título grande + una frase de apoyo,
 *   3. bloques con su propio encabezado (cada cosa distinta, en su sitio),
 *   4. una sola acción principal al final.
 * Los estudios de IAT (y sus variantes) tienen su propio corredor y no usan este kit.
 */

/** Marco de pantalla: marca arriba, contenido centrado a una columna legible. */
export function ParticipantScreen({
  children,
  width = "xl",
  aside,
}: {
  children: ReactNode;
  width?: "xl" | "3xl";
  /** Texto corto a la derecha de la marca (p. ej. «Paso 2 de 3»). */
  aside?: ReactNode;
}) {
  return (
    <main className={`mx-auto flex min-h-dvh w-full flex-col px-6 pb-10 pt-6 ${width === "3xl" ? "max-w-3xl" : "max-w-xl"}`}>
      <div className="flex items-center justify-between pb-6">
        <Logo width={104} decorative />
        {aside ? <p className="font-display text-sm font-semibold text-muted">{aside}</p> : null}
      </div>
      <div className="my-auto space-y-8">{children}</div>
    </main>
  );
}

/** Encabezado de pantalla: icono opcional, etiqueta de contexto, título grande y frase de apoyo. */
export function ScreenHeader({
  icon,
  eyebrow,
  title,
  lead,
  as: Heading = "h1",
}: {
  icon?: IconName;
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  as?: "h1" | "h2";
}) {
  return (
    <header className="space-y-3">
      {icon ? (
        <div>
          <IconTile name={icon} size="lg" />
        </div>
      ) : null}
      {eyebrow ? (
        <p>
          <Tag className="text-sm">{eyebrow}</Tag>
        </p>
      ) : null}
      <Heading className="text-3xl font-bold leading-tight text-balance sm:text-4xl">{title}</Heading>
      {lead ? <div className="text-lg leading-relaxed text-foreground">{lead}</div> : null}
    </header>
  );
}

/** Texto largo en párrafos: respeta los saltos de línea del investigador y separa cada párrafo. */
export function Prose({ text, size = "base", className = "" }: { text: string; size?: "base" | "lg"; className?: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className={`space-y-3 leading-relaxed ${size === "lg" ? "text-lg" : "text-base"} ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i} className="max-w-none whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

/** Bloque con encabezado propio: lo que es distinto se ve distinto. */
export function Section({
  icon,
  title,
  children,
}: {
  icon?: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold text-heading">
        {icon ? <IconTile name={icon} size="sm" /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Texto de lectura (consentimiento, avisos largos) sobre una superficie propia, apartado del resto. */
export function ReadingPanel({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-border bg-surface p-5">{children}</div>;
}

/** Datos breves de qué esperar: icono + una línea, sin caja. */
export function FactList({ items }: { items: { icon: IconName; text: ReactNode }[] }) {
  return (
    <ul className="space-y-3">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-3 text-base">
          <IconTile name={it.icon} size="sm" />
          <span>{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Indicación para quien responde: se distingue del texto corriente con un fondo propio y un título. */
export function Callout({
  icon = "agenda",
  title,
  children,
}: {
  icon?: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <aside className="flex gap-4 rounded-lg bg-neuro/10 p-4">
      <IconTile name={icon} size="md" className="bg-neuro/15" />
      <div className="min-w-0 space-y-1">
        <p className="font-display text-base font-semibold text-heading">{title}</p>
        <div className="text-base leading-relaxed">{children}</div>
      </div>
    </aside>
  );
}

/** Casilla de aceptación grande: toda la tarjeta es el objetivo de toque y cambia al marcarla. */
export function ConsentCheck({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-control p-4 text-base font-medium transition-colors duration-150 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 motion-reduce:transition-none">
      <input type="checkbox" className="mt-0.5 size-5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** Pantalla de un solo mensaje (gracias, liga cerrada, error, guardando): icono, título y texto. */
export function StatusScreen({
  icon,
  title,
  children,
  actions,
  testId,
  role,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  testId?: string;
  role?: "status" | "alert";
}) {
  return (
    <ParticipantScreen>
      <div className="flex flex-col items-center gap-5 text-center" data-testid={testId} role={role}>
        <IconTile name={icon} size="lg" className="size-20 p-4" />
        <h1 className="text-3xl font-bold leading-tight text-balance">{title}</h1>
        {children ? <div className="max-w-md space-y-3 text-base leading-relaxed">{children}</div> : null}
        {actions ? <div className="flex flex-wrap justify-center gap-3 pt-2">{actions}</div> : null}
      </div>
    </ParticipantScreen>
  );
}

/** Tarjeta de una pregunta: número, enunciado y respuestas juntas; separada de la siguiente. */
export function QuestionCard({ number, children }: { number?: number; children: ReactNode }) {
  return (
    <div className="relative rounded-lg border border-border bg-surface p-5 pl-5 sm:p-6">
      {number !== undefined ? (
        <span
          aria-hidden="true"
          className="mb-3 inline-flex size-8 items-center justify-center rounded-full bg-neuro/15 font-display text-sm font-semibold text-neuro-ink"
        >
          {number}
        </span>
      ) : null}
      {children}
    </div>
  );
}
