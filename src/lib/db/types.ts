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
  tool_type: "iat";
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
