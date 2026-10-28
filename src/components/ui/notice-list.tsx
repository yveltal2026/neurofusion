import { Alert } from "@/components/ui/alert";

export interface Notice {
  level: "error" | "warning" | "info";
  text: string;
}

const RANK = { error: 0, warning: 1, info: 2 } as const;

/**
 * Avisos ordenados por gravedad: los errores y advertencias van a la vista, las notas informativas se
 * pliegan en un solo bloque para que no empujen el contenido hacia abajo.
 */
export function NoticeList({ notices, infoTitle = "Notas sobre los datos" }: { notices: Notice[]; infoTitle?: string }) {
  const sorted = [...notices].sort((a, b) => RANK[a.level] - RANK[b.level]);
  const loud = sorted.filter((n) => n.level !== "info");
  const info = sorted.filter((n) => n.level === "info");
  if (sorted.length === 0) return null;
  return (
    <div className="space-y-2">
      {loud.map((n) => (
        <Alert key={n.text} tone={n.level === "error" ? "error" : "warning"}>
          {n.text}
        </Alert>
      ))}
      {info.length > 0 ? (
        <details className="rounded-md bg-neuro/10 px-4 py-2.5 text-sm">
          <summary className="cursor-pointer font-medium text-heading">
            {infoTitle} ({info.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {info.map((n) => (
              <li key={n.text}>{n.text}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
