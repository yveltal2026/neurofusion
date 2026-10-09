/**
 * Siembra un estudio de demostración con participantes SIMULADOS en la cuenta de un
 * usuario existente. Uso (requiere .env.local con las credenciales de Supabase):
 *
 *   npm run seed:demo -- tu@correo.com [numero_de_participantes]
 *
 * Los datos son sintéticos (referencias "demo-001"…) y se marcan así en la tabla de datos.
 * Es idempotente por estudio: cada ejecución crea un estudio nuevo.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { DEMO_STUDY_NAME, demoConfig, simulateDemoPopulation } from "../src/tools/iat/demo";

const [email, countArg] = process.argv.slice(2);
const count = Number(countArg ?? 36);
if (!email || !Number.isInteger(count) || count < 1 || count > 200) {
  console.error("Uso: npm run seed:demo -- tu@correo.com [participantes 1-200]");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (revisa .env.local).");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function findUserId(target: string): Promise<string> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (user) return user.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`No existe un usuario con el correo ${target}. Regístrate primero en la app.`);
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

/** Como `must`, pero exige que haya una fila (consultas .single()). */
async function one<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const data = await must(label, p);
  if (data === null || data === undefined) throw new Error(`${label}: sin resultado`);
  return data as NonNullable<T>;
}

const userId = await findUserId(email);
const membership = await one(
  "membresía",
  admin.from("memberships").select("org_id").eq("user_id", userId).order("created_at").limit(1).single(),
);

const project = await one(
  "proyecto",
  admin.from("projects").insert({ org_id: membership.org_id, name: "Demo educativo (datos simulados)", description: "Proyecto de ejemplo con participantes sintéticos.", created_by: userId }).select("id").single(),
);

const config = demoConfig();
const study = await one(
  "estudio",
  admin
    .from("studies")
    .insert({
      project_id: project.id,
      tool_type: "iat",
      name: DEMO_STUDY_NAME,
      status: "published",
      config,
      access_token: randomBytes(32).toString("base64url"),
      duplicate_policy: "none",
      created_by: userId,
    })
    .select("id, access_token")
    .single(),
);

const population = simulateDemoPopulation(config, count);
const started = Date.now() - 3 * 24 * 3600_000;

for (const [i, s] of population.entries()) {
  const when = new Date(started + (i * 3 * 24 * 3600_000) / count).toISOString();
  const session = await one(
    `sesión ${s.participantRef}`,
    admin
      .from("sessions")
      .insert({
        study_id: study.id,
        participant_ref: s.participantRef,
        status: "completed",
        demographics: s.demographics,
        explicit_preference: s.explicit,
        consent_version: "demo",
        counterbalance: s.counterbalance,
        input_mode: s.inputMode,
        device_type: s.deviceType,
        screen_width: s.deviceType === "desktop" ? 1440 : 412,
        screen_height: s.deviceType === "desktop" ? 900 : 915,
        started_at: when,
        completed_at: when,
      })
      .select("id")
      .single(),
  );
  for (const rows of chunk(s.trials, 500)) {
    await must("ensayos", admin.from("trials").insert(rows.map((r) => ({ ...r, session_id: session.id, study_id: study.id }))));
  }
  await must("resultados", admin.from("session_results").insert(s.results.map((r) => ({ ...r, session_id: session.id, study_id: study.id }))));
  process.stdout.write(`\r${i + 1}/${population.length} participantes simulados`);
}

console.log(`\nListo. Abre /studies/${study.id} en la app.`);
console.log(`Liga mágica (sólo para pruebas): /s/${study.access_token}`);
