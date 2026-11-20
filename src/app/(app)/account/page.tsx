import Link from "next/link";
import { LocalTimezoneNotice, PasswordForm, ProfileForm } from "@/components/account-forms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Cuenta y ajustes · NeuroFusion" };

export default async function AccountPage() {
  const { user } = await requireUser();
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
  const provider = typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : "email";

  return (
    <div className="space-y-8">
      <div>
        <Link href="/projects" className="text-sm text-muted hover:underline">
          ← Proyectos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cuenta y ajustes</h1>
        <p className="mt-1 text-sm text-muted">Administra tu perfil de investigador, seguridad y preferencias locales.</p>
      </div>

      <Card className="space-y-4">
        <div>
          <h2 className="font-medium">Perfil</h2>
          <p className="mt-0.5 text-sm text-muted">Información básica asociada a tu cuenta.</p>
        </div>
        <ProfileForm email={user.email ?? ""} fullName={fullName} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Zona horaria y formato</h2>
        <LocalTimezoneNotice />
      </Card>

      {provider === "email" ? (
        <Card className="space-y-4">
          <div>
            <h2 className="font-medium">Seguridad</h2>
            <p className="mt-0.5 text-sm text-muted">Cambia tu contraseña de acceso.</p>
          </div>
          <PasswordForm />
        </Card>
      ) : (
        <Card className="space-y-2">
          <h2 className="font-medium">Seguridad</h2>
          <p className="text-sm text-muted">
            Tu acceso está vinculado con <span className="font-medium text-foreground capitalize">{provider}</span>. La
            contraseña se gestiona desde ese proveedor.
          </p>
        </Card>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-medium">Sesión actual</h2>
          <p className="text-sm text-muted">Cierra tu sesión en este navegador.</p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Cerrar sesión
          </Button>
        </form>
      </Card>
    </div>
  );
}
