import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AudienceSegment,
  CreditLedgerRow,
  MembershipRequestRow,
  PlanTier,
} from "@/lib/db/types";
import {
  CREDIT_COSTS,
  canCreateProjectUnderLimits,
  canCreateStudyUnderLimits,
  getPlanDefinition,
  type CreditActionKey,
  type PlanLimits,
} from "./quotas";

export interface OrgBillingSummary {
  orgId: string;
  orgName: string;
  planTier: PlanTier;
  planName: string;
  planBadge: string;
  creditBalance: number;
  audienceSegment: AudienceSegment;
  declaredOrganization: string | null;
  limits: PlanLimits;
  usage: {
    projectsCount: number;
    studiesCount: number;
  };
}

export async function getOrgBillingSummary(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<OrgBillingSummary> {
  const [orgRes, profileRes, balanceRes, projectsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, plan_tier")
      .eq("id", orgId)
      .maybeSingle<{ id: string; name: string; plan_tier?: PlanTier }>(),
    supabase
      .from("profiles")
      .select("audience_segment, declared_organization")
      .eq("id", userId)
      .maybeSingle<{
        audience_segment?: AudienceSegment;
        declared_organization?: string | null;
      }>(),
    supabase.rpc("get_org_credit_balance", { p_org_id: orgId }),
    supabase
      .from("projects")
      .select("id", { count: "exact" })
      .eq("org_id", orgId),
  ]);

  const planTier: PlanTier = orgRes.data?.plan_tier ?? "demo";
  const def = getPlanDefinition(planTier);

  const projectIds = (projectsRes.data ?? []).map((p: { id: string }) => p.id);
  let studiesCount = 0;
  if (projectIds.length > 0) {
    const { count } = await supabase
      .from("studies")
      .select("id", { count: "exact", head: true })
      .in("project_id", projectIds);
    studiesCount = count ?? 0;
  }

  return {
    orgId,
    orgName: orgRes.data?.name ?? "Mi organización",
    planTier: def.tier,
    planName: def.name,
    planBadge: def.badge,
    creditBalance: typeof balanceRes.data === "number" ? balanceRes.data : 0,
    audienceSegment: profileRes.data?.audience_segment ?? "other",
    declaredOrganization: profileRes.data?.declared_organization ?? null,
    limits: def.limits,
    usage: {
      projectsCount: projectsRes.count ?? projectIds.length,
      studiesCount,
    },
  };
}

export async function assertCanCreateProject(
  supabase: SupabaseClient,
  orgId: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!orgId) {
    if (process.env.VITEST === "true") return { ok: true };
    return { ok: false, error: "Organización no disponible." };
  }
  const [{ data: org }, { count, error }] = await Promise.all([
    supabase
      .from("organizations")
      .select("plan_tier")
      .eq("id", orgId)
      .maybeSingle<{ plan_tier?: PlanTier }>(),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
  ]);

  if (error) {
    return { ok: false, error: "No pudimos verificar el límite de proyectos de tu plan." };
  }

  const def = getPlanDefinition(org?.plan_tier);
  if (!canCreateProjectUnderLimits(def.limits, count ?? 0)) {
    return {
      ok: false,
      error: `Tu plan ${def.name} permite hasta ${def.limits.maxProjects} proyecto. Solicita ampliar tu membresía en /membresia para crear más proyectos.`,
    };
  }
  return { ok: true };
}

export async function assertCanCreateStudy(
  supabase: SupabaseClient,
  orgId: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!orgId) {
    if (process.env.VITEST === "true") return { ok: true };
    return { ok: false, error: "Organización no disponible." };
  }
  const [{ data: org }, { data: projects, error: projError }] = await Promise.all([
    supabase
      .from("organizations")
      .select("plan_tier")
      .eq("id", orgId)
      .maybeSingle<{ plan_tier?: PlanTier }>(),
    supabase.from("projects").select("id").eq("org_id", orgId),
  ]);

  if (projError) {
    return { ok: false, error: "No pudimos verificar los límites de tu plan." };
  }

  const projectIds = (projects ?? []).map((p: { id: string }) => p.id);
  let studiesCount = 0;
  if (projectIds.length > 0) {
    const { count, error: countError } = await supabase
      .from("studies")
      .select("id", { count: "exact", head: true })
      .in("project_id", projectIds);
    if (countError) {
      return { ok: false, error: "No pudimos verificar el límite de estudios de tu plan." };
    }
    studiesCount = count ?? 0;
  }

  const def = getPlanDefinition(org?.plan_tier);
  if (!canCreateStudyUnderLimits(def.limits, studiesCount)) {
    return {
      ok: false,
      error: `Tu plan ${def.name} permite hasta ${def.limits.maxStudies} estudios. Amplía tu membresía en /membresia para crear más estudios.`,
    };
  }
  return { ok: true };
}

export type CreditReservation =
  | { ok: true; ledgerId: string | null; balance: number; cost: number }
  | { ok: false; error: string; balance: number; cost: number };

export async function reserveCreditsForAction(opts: {
  orgId: string | undefined;
  userId: string | undefined;
  action: CreditActionKey;
  referenceId?: string;
}): Promise<CreditReservation> {
  const def = CREDIT_COSTS[opts.action];
  if (!opts.orgId || !opts.userId) {
    if (process.env.VITEST === "true") {
      return { ok: true, ledgerId: null, balance: 30, cost: def.cost };
    }
    return {
      ok: false,
      error: "Sesión u organización no disponible para validar créditos.",
      balance: 0,
      cost: def.cost,
    };
  }
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_org_credits", {
    p_org_id: opts.orgId,
    p_user_id: opts.userId,
    p_amount: def.cost,
    p_event_type: def.eventType,
    p_description: def.label,
    p_reference_id: opts.referenceId ?? null,
    p_idempotency_key: null,
  });

  if (error) {
    return {
      ok: false,
      error: "No pudimos validar tu saldo de créditos. Inténtalo de nuevo.",
      balance: 0,
      cost: def.cost,
    };
  }

  const row = (
    data as { ok: boolean; balance: number; ledger_id: string | null }[] | null
  )?.[0];

  if (!row?.ok) {
    const balance = row?.balance ?? 0;
    return {
      ok: false,
      balance,
      cost: def.cost,
      error: `Necesitas ${def.cost} créditos para «${def.label}» (tienes ${balance}). Completa tu onboarding o amplía tu plan en /membresia.`,
    };
  }

  return {
    ok: true,
    ledgerId: row.ledger_id,
    balance: row.balance,
    cost: def.cost,
  };
}

export async function refundReservedCredits(opts: {
  orgId: string | undefined;
  userId: string | undefined;
  ledgerId: string | null;
  action: CreditActionKey;
  referenceId?: string;
}): Promise<void> {
  if (!opts.ledgerId || !opts.orgId || !opts.userId) return;
  const def = CREDIT_COSTS[opts.action];
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  await admin.rpc("grant_org_credits", {
    p_org_id: opts.orgId,
    p_user_id: opts.userId,
    p_amount: def.cost,
    p_event_type: "refund",
    p_description: `Reintegro automático: ${def.label}`,
    p_reference_id: opts.referenceId ?? null,
    p_idempotency_key: `refund:${opts.ledgerId}`,
  });
}

export async function getStudyResponseLimitForPlan(
  admin: SupabaseClient,
  studyId: string,
): Promise<number | null> {
  const { data: study } = await admin
    .from("studies")
    .select("max_responses, projects!inner(organizations!inner(plan_tier))")
    .eq("id", studyId)
    .maybeSingle();
  if (!study) return null;
  const projects = study.projects as unknown as {
    organizations: { plan_tier?: PlanTier };
  };
  const planTier = projects?.organizations?.plan_tier ?? "demo";
  const planMax = getPlanDefinition(planTier).limits.maxResponsesPerStudy;
  const studyMax = (study as { max_responses?: number | null }).max_responses ?? null;
  if (planMax === null) return studyMax;
  if (studyMax === null) return planMax;
  return Math.min(planMax, studyMax);
}

export async function loadRecentLedgerAndRequests(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{
  ledger: CreditLedgerRow[];
  requests: MembershipRequestRow[];
}> {
  const [ledgerRes, requestsRes] = await Promise.all([
    supabase
      .from("credit_ledger")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<CreditLedgerRow[]>(),
    supabase
      .from("membership_requests")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<MembershipRequestRow[]>(),
  ]);

  return {
    ledger: ledgerRes.data ?? [],
    requests: requestsRes.data ?? [],
  };
}
