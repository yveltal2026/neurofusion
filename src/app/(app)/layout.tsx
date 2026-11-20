import { cookies } from "next/headers";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";
import { WorkspaceAppearance } from "@/components/workspace-appearance";
import { signOut } from "@/lib/auth/actions";
import { isSupabaseConfigured } from "@/lib/env";
import type { StudyRow } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import {
  readWorkspaceTheme,
  WORKSPACE_THEME_COOKIE,
} from "@/lib/workspace-theme";
import { getStudyTool } from "@/tools/registry";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    cookieStore,
    recentResult,
  ] = await Promise.all([
    supabase.auth.getUser(),
    cookies(),
    supabase
      .from("studies")
      .select("id, name, tool_type, config")
      .order("updated_at", { ascending: false })
      .limit(3)
      .returns<Pick<StudyRow, "id" | "name" | "tool_type" | "config">[]>(),
  ]);
  const theme = readWorkspaceTheme(
    cookieStore.get(WORKSPACE_THEME_COOKIE)?.value,
  );
  const recentStudies = (recentResult.data ?? []).map((study) => ({
    id: study.id,
    name: study.name,
    icon: getStudyTool(study)?.icon ?? ("layers" as const),
  }));

  return (
    <WorkspaceAppearance
      initialTheme={theme}
      recentStudies={recentStudies}
      account={
        <>
          {user?.email ? (
            <span className="min-w-0 flex-1 truncate text-xs" title={user.email}>
              {user.email}
            </span>
          ) : null}
          <form action={signOut} className="ml-auto shrink-0">
            <Button type="submit" variant="ghost" className="px-2">
              Salir
            </Button>
          </form>
        </>
      }
    >
      {children}
    </WorkspaceAppearance>
  );
}
