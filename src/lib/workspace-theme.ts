export const WORKSPACE_THEME_COOKIE = "aesteros-theme";

export type WorkspaceTheme = "system" | "light" | "dark";

export const WORKSPACE_THEME_OPTIONS: { value: WorkspaceTheme; label: string; hint: string }[] = [
  { value: "light", label: "Claro", hint: "Fondo neutro luminoso con tarjetas blancas." },
  { value: "dark", label: "Profundo", hint: "Superficie oscura de alto contraste." },
  { value: "system", label: "Sistema", hint: "Sigue la preferencia de tu dispositivo." },
];

export function readWorkspaceTheme(value: string | undefined): WorkspaceTheme {
  return value === "light" || value === "dark" ? value : "system";
}
