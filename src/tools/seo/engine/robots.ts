import { finding } from "./rules";
import type { Finding } from "./types";

export interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
}

/** Parser de robots.txt (RFC 9309, lo suficiente para auditar y rastrear con cortesía). */
export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" || key === "allow") {
      // "Disallow:" vacío no bloquea nada.
      if (key === "disallow" && value === "") continue;
      current.rules.push({ allow: key === "allow", path: value });
    }
  }
  return { groups, sitemaps };
}

function groupFor(robots: ParsedRobots, agent: string): RobotsGroup | null {
  const a = agent.toLowerCase();
  return (
    robots.groups.find((g) => g.agents.some((x) => x !== "*" && a.includes(x))) ??
    robots.groups.find((g) => g.agents.includes("*")) ??
    null
  );
}

function patternToRegex(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path)
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** ¿Puede el agente rastrear esta ruta? Gana la regla más específica (más larga); empate → allow. */
export function isAllowed(robots: ParsedRobots, pathWithQuery: string, agent = "*"): boolean {
  const g = groupFor(robots, agent);
  if (!g) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of g.rules) {
    if (!patternToRegex(r.path).test(pathWithQuery)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}

/** Hallazgos de robots.txt. `text` null = no accesible. */
export function auditRobots(text: string | null, status: number | null): { findings: Finding[]; robots: ParsedRobots | null } {
  if (text === null) {
    return {
      robots: null,
      findings: [finding("robots.reachable", "high", `robots.txt no accesible (${status ?? "sin respuesta"}).`, null)],
    };
  }
  const robots = parseRobots(text);
  const findings = [finding("robots.reachable", "ok", "robots.txt responde 200.", null)];
  if (robots.sitemaps.length === 0) findings.push(finding("robots.sitemap_declared", "high", "robots.txt no declara ningún Sitemap.", null));
  else findings.push(finding("robots.sitemap_declared", "ok", `Declara ${robots.sitemaps.length} sitemap(s).`, null));

  const blocked = ["Googlebot", "Bingbot", "*"].filter((a) => !isAllowed(robots, "/", a));
  if (blocked.length) findings.push(finding("robots.blocks_all", "critical", `Bloquea todo el sitio para: ${blocked.join(", ")}.`, null));
  else findings.push(finding("robots.blocks_all", "ok", "No bloquea la raíz del sitio a los buscadores.", null));
  return { findings, robots };
}
