import { SettingsAppearancePanel, SettingsPasswordForm } from "@/components/settings-panels";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import pkg from "../../../../package.json";

export const metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const [projectsRes, studiesRes, analysesRes] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("studies").select("id", { count: "exact", head: true }),
    supabase.from("analyses").select("id", { count: "exact", head: true }),
  ]);

  const projectCount = projectsRes.count ?? 0;
  const studyCount = studiesRes.count ?? 0;
  const aiAnalysisCount = analysesRes.count ?? 0;
  const fullName =
    typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
      ? user.user_metadata.full_name.trim()
      : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2 border-b border-border/70 pb-4">
        <Breadcrumbs items={[{ label: "Proyectos", href: "/projects" }, { label: "Ajustes" }]} />
        <h1 className="page-title">Ajustes</h1>
        <p className="text-sm text-muted">
          Administra tu cuenta, seguridad, apariencia y detalles de la plataforma.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section
          aria-labelledby="settings-account"
          className="space-y-4 rounded-panel border border-border bg-surface p-5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="settings-account" className="text-lg font-bold text-heading">
                Cuenta y sesión
              </h2>
              <p className="text-xs text-muted">Acceso con correo electrónico en Aesteros.</p>
            </div>
            <StatusBadge tone="success">Activa</StatusBadge>
          </div>
          <dl className="divide-y divide-border/70 text-sm">
            {fullName ? (
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-muted">Nombre</dt>
                <dd className="font-semibold text-heading">{fullName}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-muted">Correo</dt>
              <dd className="truncate font-semibold text-heading">{user.email ?? "Sin correo"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-muted">Acceso</dt>
              <dd className="font-semibold text-heading">Correo y contraseña</dd>
            </div>
          </dl>
          <form action={signOut} className="pt-1">
            <Button type="submit" variant="secondary" size="sm">
              Cerrar sesión
            </Button>
          </form>
        </section>

        <section
          aria-labelledby="settings-activity"
          className="space-y-4 rounded-panel border border-border bg-surface p-5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="settings-activity" className="text-lg font-bold text-heading">
                Actividad y plataforma
              </h2>
              <p className="text-xs text-muted">Resumen de tu espacio de trabajo en Aesteros.</p>
            </div>
            <StatusBadge tone="neutral">v{pkg.version}</StatusBadge>
          </div>
          <dl className="divide-y divide-border/70 text-sm">
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-muted">Proyectos</dt>
              <dd className="font-semibold tabular-nums text-heading">{projectCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-muted">Estudios</dt>
              <dd className="font-semibold tabular-nums text-heading">{studyCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-muted">Síntesis e informes IA</dt>
              <dd className="font-semibold tabular-nums text-heading">
                {aiAnalysisCount} generados
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section
        aria-labelledby="settings-appearance"
        className="space-y-4 rounded-panel border border-border bg-surface p-5 sm:p-6"
      >
        <div>
          <h2 id="settings-appearance" className="text-lg font-bold text-heading">
            Apariencia
          </h2>
          <p className="text-xs text-muted">Elige cómo se muestra el espacio de trabajo en este dispositivo.</p>
        </div>
        <SettingsAppearancePanel />
      </section>

      <section
        aria-labelledby="settings-security"
        className="space-y-4 rounded-panel border border-border bg-surface p-5 sm:p-6"
      >
        <div>
          <h2 id="settings-security" className="text-lg font-bold text-heading">
            Seguridad
          </h2>
          <p className="text-xs text-muted">
            Confirma tu contraseña actual para actualizarla sin cerrar tu sesión.
          </p>
        </div>
        <SettingsPasswordForm />
      </section>
    </div>
  );
}
