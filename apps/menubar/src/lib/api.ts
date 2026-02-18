import { invoke } from "@tauri-apps/api/core";

/** Session info returned from Rust backend */
export interface SessionInfo {
  sessionId: string;
  port: number;
  controlPort: number;
  pid: number;
  startedAt: number;
  cwd: string | null;
  projectName: string;
  switched: boolean;
  provider: string | null;
  model: string | null;
  healthy: boolean;
}

/** Provider with its available models */
export interface ProviderInfo {
  name: string;
  models: ModelInfo[];
}

export interface ModelInfo {
  id: string;
  label: string;
}

/** Switch/revert response */
export interface SwitchResponse {
  switched: boolean;
  provider: string | null;
  model: string | null;
  sessionId: string | null;
  message: string | null;
  warning: string | null;
}

/** List all active proxy sessions */
export async function listSessions(): Promise<SessionInfo[]> {
  return invoke("list_sessions");
}

/** Switch a session to a different model */
export async function switchModel(
  controlPort: number,
  sessionId: string,
  provider: string,
  model: string
): Promise<SwitchResponse> {
  return invoke("switch_model", {
    controlPort,
    sessionId,
    provider,
    model,
  });
}

/** Revert a session to native Claude */
export async function revertModel(
  controlPort: number,
  sessionId: string
): Promise<SwitchResponse> {
  return invoke("revert_model", { controlPort, sessionId });
}

/** Get available providers and models */
export async function getProviders(): Promise<ProviderInfo[]> {
  return invoke("get_providers");
}
