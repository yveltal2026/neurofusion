import { loadSurveyByToken } from "@/lib/participant-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { ASSETS_BUCKET } from "@/lib/study-files";
import { listItems } from "@/tools/survey/engine";

/** La liga es la credencial: sólo entrega una imagen referenciada por esta encuesta. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; itemId: string }> },
) {
  const { token, itemId } = await params;
  const loaded = await loadSurveyByToken(token);
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  if (!loaded.ok) return new Response(null, { status: 404, headers });
  // También sirve vistas previas de borradores y pasos de baterías, igual que la página /s/[token].
  const image = listItems(loaded.study.config).find(
    (item) => item.id === itemId,
  )?.image;
  if (!image || !image.path.startsWith(`${loaded.study.id}/`))
    return new Response(null, { status: 404, headers });
  const { data, error } = await createAdminClient()
    .storage.from(ASSETS_BUCKET)
    .download(image.path);
  if (error || !data) return new Response(null, { status: 404, headers });
  const mime = image.path.endsWith(".png")
    ? "image/png"
    : image.path.endsWith(".jpg")
      ? "image/jpeg"
      : "image/webp";
  return new Response(data, { headers: { ...headers, "Content-Type": mime } });
}
