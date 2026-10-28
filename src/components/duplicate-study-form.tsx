import { Icon } from "@/components/brand/icon";
import { Button } from "@/components/ui/button";
import { Block } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { requireUser } from "@/lib/auth/session";
import { duplicateStudy } from "@/app/(app)/studies/[id]/actions";

/** Copia el estudio (configuración, sin datos) al mismo proyecto o a otro. Server component: lee los proyectos con RLS. */
export async function DuplicateStudyForm({ studyId, projectId }: { studyId: string; projectId: string }) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("projects").select("id, name").order("created_at", { ascending: false });
  const projects = data ?? [];

  return (
    <Block className="space-y-3">
      <SectionTitle icon="copy">Duplicar o usar como plantilla</SectionTitle>
      <p className="text-sm text-muted">
        Crea una copia con la misma configuración, una liga nueva y sin respuestas. Queda en borrador: publícala en Ajustes cuando esté lista.
      </p>
      <form action={duplicateStudy} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={studyId} />
        <label className="space-y-1 text-sm">
          <span className="font-medium">Proyecto de destino</span>
          <select
            name="projectId"
            defaultValue={projectId}
            className="block h-11 min-w-56 rounded-md border border-border bg-surface px-3 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          <Icon name="copy" className="size-5" />
          Crear copia
        </Button>
      </form>
    </Block>
  );
}
