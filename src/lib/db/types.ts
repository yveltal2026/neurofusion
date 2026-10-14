/** Filas tal como las devuelve Supabase (espejo de supabase/migrations). */

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
  tool_type: "iat" | "seo" | "visual";
  name: string;
  status: StudyStatus;
  config: unknown;
  /** Sólo el IAT tiene liga mágica. */
  access_token: string | null;
  max_responses: number | null;
  closes_at: string | null;
  duplicate_policy: DuplicatePolicy;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
