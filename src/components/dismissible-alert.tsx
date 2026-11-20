"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/brand/icon";
import { Alert } from "@/components/ui/alert";

export function DismissibleAlert({
  tone = "success",
  clearParam,
  children,
}: {
  tone?: "error" | "info" | "warning" | "success";
  clearParam?: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!clearParam) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has(clearParam)) return;
    params.delete(clearParam);
    const next = params.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [clearParam]);

  if (!visible) return null;

  return (
    <Alert tone={tone}>
      <div className="flex items-start justify-between gap-3">
        <span>{children}</span>
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={() => setVisible(false)}
          className="-my-2 -mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-heading motion-reduce:transition-none"
        >
          <Icon name="close" className="size-3.5" />
        </button>
      </div>
    </Alert>
  );
}
