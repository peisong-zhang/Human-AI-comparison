import axios from "axios";
import {
  ConfigResponse,
  RecordPayload,
  SessionStartResponse
} from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "/"
});

export async function fetchConfig(): Promise<ConfigResponse> {
  const { data } = await api.get<ConfigResponse>("/api/config");
  return data;
}

interface StartSessionParams {
  participant_id: string;
  group_id: string;
  mode_id: string;
}

export async function startSession(
  params: StartSessionParams
): Promise<SessionStartResponse> {
  const { data } = await api.post<SessionStartResponse>("/api/session/start", params);
  return data;
}

export async function recordAnswer(payload: RecordPayload): Promise<void> {
  await api.post("/api/record", payload);
}

export async function finishSession(
  session_id: string,
  total_elapsed_ms: number
): Promise<void> {
  await api.post("/api/session/finish", { session_id, total_elapsed_ms });
}

export async function downloadCsv(
  filters: Record<string, string | undefined> = {}
): Promise<Blob> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  const { data } = await api.get("/api/export/csv", {
    params,
    responseType: "blob"
  });
  return data;
}
