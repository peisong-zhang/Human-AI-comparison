export type AnswerValue = "yes" | "no" | "skip" | "timeout";

export interface GroupConfig {
  group_id: string;
  name: string;
  per_item_seconds?: number | null;
  hard_timeout: boolean;
  soft_timeout: boolean;
  quota?: number | null;
}

export interface ModeImage {
  image_id: string;
  filename: string;
  title: string;
  url: string;
}

export interface ModeConfig {
  mode_id: string;
  name: string;
  task_markdown: string;
  guidelines_markdown: string;
  randomize: boolean;
  per_item_seconds?: number | null;
  images: ModeImage[];
}

export interface ConfigResponse {
  batch_id: string;
  default_per_item_seconds: number;
  allow_resume: boolean;
  groups: GroupConfig[];
  modes: ModeConfig[];
}

export interface SessionItem {
  image_id: string;
  filename: string;
  order_index: number;
  title: string;
  url: string;
}

export interface SessionStartResponse {
  session_id: string;
  batch_id: string;
  mode_id: string;
  group_id: string;
  participant_id: string;
  items: SessionItem[];
  allow_resume: boolean;
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
