"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/session";
import type { OnboardingProgressRow } from "@/lib/db/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { ONBOARDING_MISSIONS, type OnboardingMissionId } from "./missions";

export interface OnboardingStateSnapshot {
  completedMissions: OnboardingMissionId[];
  tourCompletedAt: string | null;
  checklistDismissedAt: string | null;
  bonusAwardedAt: string | null;
}

export async function getOrSyncOnboardingState(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  counts: { projectsCount: number; studiesCount: number },
): Promise<OnboardingStateSnapshot> {
  const admin = createAdminClient();
  let { data: row } = await supabase
    .from("onboarding_progress")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle<OnboardingProgressRow>();

  if (!row) {
    const { data: inserted } = await admin
      .from("onboarding_progress")
      .upsert({ org_id: orgId, user_id: userId }, { onConflict: "org_id" })
      .select("*")
      .single<OnboardingProgressRow>();
    row = inserted ?? {
      org_id: orgId,
      user_id: userId,
      completed_missions: [],
      tour_completed_at: null,
      checklist_dismissed_at: null,
      bonus_awarded_at: null,
      updated_at: new Date().toISOString(),
    };
  }

  const existing = new Set(row.completed_missions ?? []);
  const achieved = new Set<OnboardingMissionId>(
    [...existing].filter((id): id is OnboardingMissionId =>
      ONBOARDING_MISSIONS.some((m) => m.id === id),
    ),
  );

  // Misión 1: perfil capturado al registrarse.
  achieved.add("profile_confirmed");
  if (counts.projectsCount >= 1) achieved.add("first_project");
  if (counts.studiesCount >= 1) achieved.add("first_study");
  if (row.tour_completed_at) achieved.add("guided_tour_or_sample");

  const newlyCompleted = ONBOARDING_MISSIONS.filter(
    (m) => achieved.has(m.id) && !existing.has(m.id),
  );

  for (const mission of newlyCompleted) {
    await admin.rpc("grant_org_credits", {
      p_org_id: orgId,
      p_user_id: userId,
      p_amount: mission.rewardCredits,
      p_event_type: "onboarding_mission",
      p_description: `Misión onboarding: ${mission.title}`,
      p_reference_id: mission.id,
      p_idempotency_key: `onboarding:${mission.id}`,
    });
  }

  const completedList = ONBOARDING_MISSIONS.filter((m) => achieved.has(m.id)).map(
    (m) => m.id,
  );
  const allComplete = completedList.length === ONBOARDING_MISSIONS.length;
  const nextBonusAt =
    row.bonus_awarded_at ?? (allComplete ? new Date().toISOString() : null);

  if (
    newlyCompleted.length > 0 ||
    (allComplete && !row.bonus_awarded_at)
  ) {
    await admin
      .from("onboarding_progress")
      .update({
        completed_missions: completedList,
        bonus_awarded_at: nextBonusAt,
      })
      .eq("org_id", orgId);
  }

  return {
    completedMissions: completedList,
    tourCompletedAt: row.tour_completed_at,
    checklistDismissedAt: row.checklist_dismissed_at,
    bonusAwardedAt: nextBonusAt,
  };
}

export async function completeTourMissionAction(): Promise<{ ok: boolean }> {
  const { supabase, user, orgId } = await requireUser();
  const admin = createAdminClient();
  const now = new Date().toISOString();

  await admin
    .from("onboarding_progress")
    .upsert(
      { org_id: orgId, user_id: user.id, tour_completed_at: now },
      { onConflict: "org_id" },
    );

  const [projRes, studyRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id", { count: "exact" })
      .eq("org_id", orgId),
    supabase.from("studies").select("id", { count: "exact", head: true }),
  ]);

  await getOrSyncOnboardingState(supabase, orgId, user.id, {
    projectsCount: projRes.count ?? projRes.data?.length ?? 0,
    studiesCount: studyRes.count ?? 0,
  });

  revalidatePath("/projects");
  revalidatePath("/membresia");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function dismissOnboardingChecklistAction(): Promise<void> {
  const { user, orgId } = await requireUser();
  const admin = createAdminClient();
  await admin
    .from("onboarding_progress")
    .upsert(
      {
        org_id: orgId,
        user_id: user.id,
        checklist_dismissed_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
  revalidatePath("/projects");
}

export async function reopenOnboardingChecklistAction(): Promise<void> {
  const { user, orgId } = await requireUser();
  const admin = createAdminClient();
  await admin
    .from("onboarding_progress")
    .upsert(
      {
        org_id: orgId,
        user_id: user.id,
        checklist_dismissed_at: null,
      },
      { onConflict: "org_id" },
    );
  revalidatePath("/projects");
}
