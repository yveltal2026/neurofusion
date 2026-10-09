import { Alert } from "@/components/ui/alert";

export function SetupNotice() {
  return (
    <div className="mx-auto max-w-lg p-6">
      <Alert tone="warning">
        <p className="font-medium">Falta configurar Supabase</p>
        <p className="mt-1">
          Copia <code>.env.example</code> a <code>.env.local</code> y completa{" "}
          <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          Luego aplica las migraciones de <code>supabase/migrations</code>.
        </p>
      </Alert>
    </div>
  );
}
