export type AnswerValue = "yes" | "no" | "skip" | "timeout";

export interface GroupSequenceStage {
  subset_id: string;
  mode_id: string;
  label?: string | null;
}

export interface GroupConfig {
  group_id: string;
  name: string;
  per_item_seconds?: number | null;
  hard_timeout: boolean;
  soft_timeout: boolean;
  quota?: number | null;
  role_quotas?: Record<string, number> | null;
  sequence: GroupSequenceStage[];
}

export interface ConfigSubset {
  subset_id: string;
  name: string;
  description?: string | null;
  case_count: number;
}

export interface ModeConfig {
  mode_id: string;
  name: string;
  ai_enabled: boolean;
  task_markdown: string;
  guidelines_markdown: string;
  per_item_seconds?: number | null;
}

export interface ConfigResponse {
  batch_id: string;
  default_per_item_seconds: number;
  allow_resume: boolean;
  subsets: ConfigSubset[];
  modes: ModeConfig[];
  groups: GroupConfig[];
  participant_roles: string[];
}

export interface StageInfo {
  stage_index: number;
  subset_id: string;
  subset_name: string;
  mode_id: string;
  mode_name: string;
  label?: string | null;
  ai_enabled: boolean;
  task_markdown: string;
  guidelines_markdown: string;
  total_items: number;
}

export interface SessionItem {
  stage_index: number;
  subset_id: string;
  mode_id: string;
  image_id: string;
  filename: string;
  order_index: number;
  title: string;
  url: string;
}

export interface SessionStartResponse {
  session_id: string;
  batch_id: string;
  group_id: string;
  participant_id: string;
  participant_role?: string;
  stages: StageInfo[];
  items: SessionItem[];
  allow_resume: boolean;
  current_index?: number | null;
  elapsed_ms_global?: number | null;
  responses?: ResponseSnapshot[] | null;
}

export interface ResponseSnapshot {
  order_index: number;
  answer: AnswerValue;
  skipped: boolean;
  item_timeout: boolean;
  elapsed_ms_item?: number | null;
  elapsed_ms_global?: number | null;
  recorded_at?: string | null;
}

export interface QuotaGroupStatus {
  group_id: string;
  name: string;
  limit: number | null;
  completed: number;
  remaining: number | null;
}

export interface QuotaStatusResponse {
  participant_role: string;
  groups: QuotaGroupStatus[];
}

export interface RecordPayload {
  session_id: string;
  image_id: string;
  answer: AnswerValue;
  order_index: number;
  elapsed_ms_item?: number;
  elapsed_ms_global?: number;
  skipped?: boolean;
  item_timeout?: boolean;
  ts_client?: string;
  user_agent?: string;
}

export interface RecordedAnswer {
  answer: AnswerValue;
  elapsed_ms_item: number;
  elapsed_ms_global: number;
  skipped: boolean;
  item_timeout: boolean;
  recorded_at: string;
}
