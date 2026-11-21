/** Filas tal como las devuelve Supabase (espejo de supabase/migrations). */

export type AudienceSegment =
  | "researcher"
  | "agency_company"
  | "teacher"
  | "student"
  | "other";

export type PlanTier = "demo" | "academic" | "pro" | "enterprise";

export type CreditEventType =
  | "initial_demo_grant"
  | "onboarding_mission"
  | "onboarding_complete"
  | "ai_analysis"
  | "ai_suggest"
  | "seo_audit"
  | "visual_ai"
  | "refund"
  | "promo_code"
  | "admin_adjustment";

export type RequestedPlan =
  | "academic_teacher"
  | "academic_institution"
  | "pro_researcher"
  | "agency_team"
  | "custom_credits";

export interface ProfileRow {
  id: string;
  full_name: string | null;
  audience_segment: AudienceSegment;
  declared_organization: string | null;
  audience_other_detail: string | null;
  created_at: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  plan_tier: PlanTier;
  plan_updated_at: string;
  created_at: string;
}

export interface CreditLedgerRow {
  id: string;
  org_id: string;
  user_id: string | null;
  delta: number;
  event_type: CreditEventType;
  description: string;
  reference_id: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface OnboardingProgressRow {
  org_id: string;
  user_id: string;
  completed_missions: string[];
  tour_completed_at: string | null;
  checklist_dismissed_at: string | null;
  bonus_awarded_at: string | null;
  updated_at: string;
}

export interface MembershipRequestRow {
  id: string;
  org_id: string;
  user_id: string;
  audience_segment: AudienceSegment;
  requested_plan: RequestedPlan;
  organization_name: string;
  institutional_email: string | null;
  notes: string | null;
  status: "pending" | "contacted" | "approved" | "rejected";
  created_at: string;
}

export interface ProjectRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type StudyStatus = "draft" | "published" | "closed";
export type DuplicatePolicy = "device_cookie" | "device_cookie_and_ip" | "none";

export interface StudyRow {
  id: string;
  project_id: string;
  tool_type: "iat" | "seo" | "visual" | "survey" | "iat_variant" | "web_visual" | "web_eyetracking";
  name: string;
  status: StudyStatus;
  config: unknown;
  /** Las herramientas con participantes (IAT, variantes, encuesta y webcam) tienen liga mágica. */
  access_token: string | null;
  max_responses: number | null;
  closes_at: string | null;
  duplicate_policy: DuplicatePolicy;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatteryRow {
  id: string;
  project_id: string;
  name: string;
  status: StudyStatus;
  config: unknown;
  access_token: string;
  max_responses: number | null;
  closes_at: string | null;
  duplicate_policy: DuplicatePolicy;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatteryStepRow {
  battery_id: string;
  position: number;
  study_id: string;
  enabled: boolean;
}

export interface BatterySessionRow {
  id: string;
  battery_id: string;
  participant_ref: string;
  status: "started" | "completed" | "abandoned";
  run_order: string[];
  device_type: string;
  excluded: boolean;
  excluded_reason: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface SeoAuditRow {
  id: string;
  study_id: string;
  mode: "live" | "upload";
  site_url: string;
  engine_version: string;
  summary: unknown;
  pages: unknown;
  findings: unknown;
  performance: unknown;
  notes: unknown;
  duration_ms: number | null;
  ai_result: unknown;
  ai_provider: string | null;
  ai_model: string | null;
  ai_generated_at: string | null;
  created_at: string;
}

export interface VisualAssetRow {
  id: string;
  study_id: string;
  storage_path: string;
  file_name: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  title: string;
  placement: string | null;
  site_key: string | null;
  task_id: string | null;
  position: number;
  metrics: unknown;
  metrics_version: string | null;
  ai_result: unknown;
  ai_provider: string | null;
  ai_model: string | null;
  ai_engine_version: string | null;
  ai_generated_at: string | null;
  aois: unknown;
  aois_source: "none" | "ai" | "analyst";
  aois_reviewed_at: string | null;
  created_at: string;
}

export interface EyeTrackingRunRow {
  session_id: string;
  study_id: string;
  validation: unknown;
  observations: unknown;
  created_at: string;
}

export interface WebEyetrackingRunRow {
  session_id: string;
  study_id: string;
  mode: "live_snippet" | "no_code_captures";
  validation: unknown;
  step_events: unknown;
  samples: unknown;
  summary: unknown;
  created_at: string;
}

export interface FrictionRatingRow {
  id: string;
  study_id: string;
  site_key: string;
  item_key: string;
  value: number;
  justification: string;
  evidence_asset_id: string | null;
  source: "analyst" | "ai_assisted";
  rubric_version: string;
  updated_at: string;
}

export interface IfdMeasurementRow {
  id: string;
  study_id: string;
  run_id: string;
  site_key: string;
  site_name: string;
  site_url: string;
  is_competitor: boolean;
  engine_version: string;
  ifd_version: string;
  calibration_version: string;
  rubric_version: string;
  seed: number;
  n_panel: number;
  inputs: unknown;
  summary: unknown;
  score: number;
  ifd: number;
  reading: string;
  created_at: string;
}
