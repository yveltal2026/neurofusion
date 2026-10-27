/**
 * Agrega las sesiones JSON descargadas de /lab/eyetracking y aplica los criterios de salida del spike
 * (docs/EYETRACKING-DECISION.md §6).
 *
 * Uso: node --import tsx scripts/aggregate-eyetracking.ts <carpeta-con-jsons>
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { THRESHOLDS, aggregateSessions, type SessionRecord } from "../src/lab/eyetracking/metrics";
import { parseExportedSession } from "../src/lab/eyetracking/session";

const dir = process.argv[2];
if (!dir) {
  console.error("Uso: node --import tsx scripts/aggregate-eyetracking.ts <carpeta-con-jsons>");
  process.exit(1);
}

const sessions: SessionRecord[] = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  try {
    const parsed = parseExportedSession(JSON.parse(readFileSync(join(dir, file), "utf8")));
    if (parsed) sessions.push(parsed);
    else console.warn(`Omitido (formato no reconocido): ${file}`);
  } catch (err) {
    console.warn(`Omitido (no es JSON válido): ${file} — ${(err as Error).message}`);
  }
}

if (sessions.length === 0) {
  console.error("No se encontró ninguna sesión válida.");
  process.exit(1);
}

const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(1));
const rows = aggregateSessions(sessions).map((a) => {
  const limit = THRESHOLDS.maxMedianErrorDeg[a.device];
  const okError = a.medianOfMedianDeg !== null && a.medianOfMedianDeg <= limit;
  const okFps = a.medianFps !== null && a.medianFps >= THRESHOLDS.minFps;
  return {
    dispositivo: a.device,
    sesiones: a.sessions,
    "pasan": `${a.passed}/${a.sessions}`,
    "error mediano (°)": fmt(a.medianOfMedianDeg),
    "peor sesión (°)": fmt(a.worstMedianDeg),
    "límite (°)": limit,
    "lecturas/s": fmt(a.medianFps),
    "criterio": okError && okFps ? "CUMPLE" : "NO CUMPLE",
  };
});

console.table(rows);
console.log(
  `Criterio del spike: mediana de los errores medianos ≤ límite por dispositivo y ≥ ${THRESHOLDS.minFps} lecturas/s.` +
    " Con pocas sesiones por dispositivo (< 5) tómalo como indicio, no como conclusión.",
);
