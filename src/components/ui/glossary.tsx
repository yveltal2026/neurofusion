import type { ReactNode } from "react";

/** «¿Qué significa?»: términos técnicos definidos junto a la tabla que los usa, plegados por defecto. */
export function Glossary({ title = "¿Qué significa?", terms }: { title?: string; terms: { term: string; meaning: ReactNode }[] }) {
  return (
    <details className="group text-sm">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 py-1 font-medium text-neuro-ink underline-offset-4 hover:underline">
        {title}
      </summary>
      <dl className="mt-2 grid gap-x-6 gap-y-2 border-l-0 sm:grid-cols-[10rem_1fr]">
        {terms.map((t) => (
          <div key={t.term} className="contents">
            <dt className="font-semibold text-heading">{t.term}</dt>
            <dd className="text-muted">{t.meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
