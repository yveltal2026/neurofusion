export const WORKSPACE_THEME_COOKIE = "aesteros-theme";

export type WorkspaceTheme = "system" | "light" | "dark";

export function readWorkspaceTheme(value: string | undefined): WorkspaceTheme {
  return value === "light" || value === "dark" ? value : "system";
}
