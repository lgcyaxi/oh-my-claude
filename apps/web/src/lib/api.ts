/**
 * HTTP client for oh-my-claude control API
 *
 * In dev mode, Vite proxies /health, /status, etc. to localhost:18911.
 * In production, the SPA is served from the same origin as the control API.
 */

const TIMEOUT = 5000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = import.meta.env.DEV ? '' : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...init?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Health & Status ── */

export interface HealthResponse {
  status: string;
  uptime: number;
  uptimeHuman: string;
  requestCount: number;
  activeSessions: number;
}

/** /status returns the switch state directly (not nested in .state) */
export interface StatusResponse {
  switched: boolean;
  provider?: string;
  model?: string;
  switchedAt?: number;
  sessionId: string | null;
}

export interface Session {
  sessionId: string;
  switched: boolean;
  provider?: string;
  model?: string;
}

export const getHealth = () => request<HealthResponse>('/health');
export const getStatus = (sessionId?: string) =>
  request<StatusResponse>(`/status${sessionId ? `?session=${sessionId}` : ''}`);
export const getSessions = () => request<{ sessions: Session[]; count: number }>('/sessions');
export const getUsage = () => request<{ providers: Record<string, number> }>('/usage');

/* ── Providers & Models ── */

export interface ModelEntry {
  id: string;
  label: string;
  note?: string;
  realId?: string;
}

export interface ProviderInfo {
  name: string;
  label: string;
  models: ModelEntry[];
}

export const getProviders = () =>
  request<{ providers: ProviderInfo[] }>('/providers');
export const getModelsForProvider = (provider: string) =>
  request<{ provider: string; models: ModelEntry[] }>(`/models?provider=${provider}`);

/* ── Switch ── */

export const switchModel = (provider: string, model: string, sessionId?: string) =>
  request<{ ok: boolean }>(`/switch${sessionId ? `?session=${sessionId}` : ''}`, {
    method: 'POST',
    body: JSON.stringify({ provider, model }),
  });

export const revertSwitch = (sessionId?: string) =>
  request<{ ok: boolean }>(`/revert${sessionId ? `?session=${sessionId}` : ''}`, {
    method: 'POST',
  });

/* ── Instance Control (forward to per-session proxy) ── */

export const switchInstanceModel = (controlPort: number, provider: string, model: string) =>
  request<{ ok: boolean }>(`/api/instances/${controlPort}/switch`, {
    method: 'POST',
    body: JSON.stringify({ provider, model }),
  });

export const revertInstance = (controlPort: number) =>
  request<{ ok: boolean }>(`/api/instances/${controlPort}/revert`, {
    method: 'POST',
  });

export const getInstanceStatus = (controlPort: number) =>
  request<StatusResponse>(`/api/instances/${controlPort}/status`);

/* ── Registry CRUD ── */

export interface RegistryProvider {
  name: string;
  label: string;
  models: ModelEntry[];
}

export interface RegistryData {
  providers: RegistryProvider[];
  agents?: Record<string, unknown>;
  categories?: Record<string, unknown>;
}

export const getRegistry = () => request<RegistryData>('/api/registry');

export const addModel = (providerName: string, model: ModelEntry) =>
  request<{ ok: boolean }>(`/api/registry/providers/${providerName}/models`, {
    method: 'POST',
    body: JSON.stringify(model),
  });

export const updateModels = (providerName: string, models: ModelEntry[]) =>
  request<{ ok: boolean }>(`/api/registry/providers/${providerName}/models`, {
    method: 'PUT',
    body: JSON.stringify({ models }),
  });

export const deleteModel = (providerName: string, modelId: string) =>
  request<{ ok: boolean }>(
    `/api/registry/providers/${providerName}/models/${encodeURIComponent(modelId)}`,
    { method: 'DELETE' },
  );

/* ── Config ── */

export interface ProviderConfig {
  name: string;
  label?: string;
  type: string;
  baseUrl?: string;
  envVar?: string;
  isConfigured: boolean;
  modelCount: number;
}

export const getConfigProviders = () =>
  request<{ providers: ProviderConfig[] }>('/api/config/providers');

/* ── Instances (aggregation) ── */

export interface ProxyInstanceSession {
  sessionId: string;
  switched: boolean;
  provider?: string;
  model?: string;
  lastActivity: number;
}

export interface ProxyInstance {
  sessionId: string;
  port: number;
  controlPort: number;
  pid: number;
  startedAt: string;
  alive: boolean;
  provider?: string;
  model?: string;
  health?: {
    uptime: number;
    uptimeHuman: string;
    requestCount: number;
    activeSessions: number;
  };
  sessions: ProxyInstanceSession[];
}

export interface InstancesSummary {
  registered: number;
  alive: number;
  totalSessions: number;
  totalRequests: number;
}

export const getInstances = () =>
  request<{ instances: ProxyInstance[]; summary: InstancesSummary }>('/api/instances');

/* ── Claude Code Sessions ── */

export interface ProjectEntry {
  folder: string;
  projectPath: string;
  sessionCount: number;
  lastModified: string | null;
}

export interface SessionEntry {
  sessionId: string;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
  isSidechain: boolean;
}

export interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  id?: string;
  content?: string | ContentBlock[];
  tool_use_id?: string;
}

export interface ConversationEntry {
  type: string;
  uuid: string;
  timestamp: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
    model?: string;
  };
}

export interface SessionMeta {
  summary: string;
  firstPrompt: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
}

export const getProjects = () =>
  request<{ projects: ProjectEntry[] }>('/api/sessions');

export const getProjectSessions = (folder: string) =>
  request<{ folder: string; projectPath: string; sessions: SessionEntry[] }>(
    `/api/sessions/${encodeURIComponent(folder)}`,
  );

export const getConversation = (folder: string, sessionId: string) =>
  request<{
    sessionId: string;
    folder: string;
    meta: SessionMeta | null;
    entries: ConversationEntry[];
  }>(`/api/sessions/${encodeURIComponent(folder)}/${sessionId}`);

export const renameSession = (folder: string, sessionId: string, summary: string) =>
  request<{ ok: boolean; sessionId: string; summary: string }>(
    `/api/sessions/${encodeURIComponent(folder)}/${sessionId}`,
    { method: 'PATCH', body: JSON.stringify({ summary }) },
  );

export const deleteSession = (folder: string, sessionId: string) =>
  request<{ ok: boolean; sessionId: string }>(
    `/api/sessions/${encodeURIComponent(folder)}/${sessionId}`,
    { method: 'DELETE' },
  );

export const cleanupEmptySessions = (folder: string) =>
  request<{ ok: boolean; deleted: number; sessionIds: string[] }>(
    `/api/sessions/${encodeURIComponent(folder)}/empty`,
    { method: 'DELETE', headers: {} },
  );

export const deleteProject = (folder: string) =>
  request<{ ok: boolean; folder: string }>(
    `/api/sessions/${encodeURIComponent(folder)}`,
    { method: 'DELETE' },
  );
