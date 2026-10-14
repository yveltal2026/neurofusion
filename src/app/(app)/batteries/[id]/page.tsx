import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { batteryLinkUrl } from "@/lib/magic-link";
import { requestOrigin } from "@/lib/request-origin";
import { loadAvailableStudies, loadBatteryDetail } from "@/tools/battery/load";
import { BatteryOverview } from "@/tools/battery/ui/overview";

export async function generateMetadata({
  params,
}: PageProps<"/batteries/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("batteries")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  return {
    title: data?.name ? `${data.name} · NeuroFusion` : "Batería · NeuroFusion",
  };
}

export default async function BatteryPage({
  params,
  searchParams,
}: PageProps<"/batteries/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser();

  const detail = await loadBatteryDetail(supabase, id);
  if (!detail) notFound();

  const [{ data: project }, available] = await Promise.all([
    supabase
      .from("projects")
      .select("name")
      .eq("id", detail.battery.project_id)
      .maybeSingle(),
    loadAvailableStudies(supabase, detail.battery.project_id),
  ]);

  return (
    <BatteryOverview
      detail={detail}
      available={available}
      projectName={project?.name ?? null}
      link={batteryLinkUrl(await requestOrigin(), detail.battery.access_token)}
      created={sp.created === "1"}
      duplicated={sp.duplicated === "1"}
    />
  );
}
