/**
 * MCP Server Manager — proxy routing kernel
 *
 * Provides:
 * - Proxy availability detection (isProxyAvailable)
 * - Provider type classification (isDirectCallViable)
 * - Request routing through proxy (routeViaProxy / routeViaClaude)
 * - Response conversion (convertAnthropicResponseToChat)
 * - Status file write for statusline display (updateStatusFile)
 */

import type { ChatMessage, ChatCompletionResponse } from "../../shared/providers/types";
import { writeFileSync } from "node:fs";
import { getSessionStatusPath, ensureSessionDir, cleanupStaleSessions } from "../../integration/statusline/session";

// Cleanup stale sessions on server startup
cleanupStaleSessions(60 * 60 * 1000); // 1 hour

// ── Proxy routing helpers ───────────────────────────────────────────

/** Proxy control API port */
const PROXY_CONTROL_PORT = 18911;
/** Proxy messages API port */
const PROXY_MESSAGES_PORT = 18910;
/** Proxy health cache TTL (30 seconds) */
const PROXY_HEALTH_TTL_MS = 30_000;
/** Timeout for proxy route requests (2 minutes) */
const PROXY_REQUEST_TIMEOUT_MS = 120_000;

let proxyHealthCache: { available: boolean; checkedAt: number } | null = null;

/**
 * Check if the oh-my-claude proxy is running (cached for 30s).
 */
export async function isProxyAvailable(): Promise<boolean> {
  const now = Date.now();
  if (proxyHealthCache && now - proxyHealthCache.checkedAt < PROXY_HEALTH_TTL_MS) {
    return proxyHealthCache.available;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://localhost:${PROXY_CONTROL_PORT}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const available = res.ok;
    proxyHealthCache = { available, checkedAt: now };
    return available;
  } catch {
    proxyHealthCache = { available: false, checkedAt: now };
    return false;
  }
}

/**
 * Check if a provider type supports direct API calls (has API key auth).
 * OAuth and subscription providers require the proxy.
 */
export function isDirectCallViable(providerType: string): boolean {
  switch (providerType) {
    case "openai-compatible":
    case "anthropic-compatible":
      return true;
    case "openai-oauth":
    case "claude-subscription":
      return false;
    default:
      return true;
  }
}

/**
 * Route a request through the proxy with a route directive.
 *
 * Sends an Anthropic Messages API request to the proxy with
 * `[omc-route:provider/model]` in the system prompt, causing the proxy
 * to route to the specified provider.
 */
export async function routeViaProxy(
  provider: string,
  model: string,
  messages: ChatMessage[],
): Promise<ChatCompletionResponse> {
  let systemText = "";
  const conversationMessages: Array<{ role: string; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemText += (systemText ? "\n\n" : "") + msg.content;
    } else {
      conversationMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const directive = `[omc-route:${provider}/${model}]`;
  systemText = systemText ? `${directive}\n\n${systemText}` : directive;

  const body = {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 16384,
    stream: false,
    system: systemText,
    messages: conversationMessages,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`http://localhost:${PROXY_MESSAGES_PORT}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": "proxy-mcp-internal",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Proxy returned ${res.status}: ${errorText.slice(0, 200)}`);
    }

    const anthropicRes = await res.json() as Record<string, unknown>;
    return convertAnthropicResponseToChat(anthropicRes);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Proxy route timed out after ${PROXY_REQUEST_TIMEOUT_MS / 1000}s for ${provider}/${model}`);
    }
    throw error;
  }
}

/**
 * Route a request through the proxy WITHOUT a directive (passthrough to Claude subscription).
 */
export async function routeViaClaude(messages: ChatMessage[]): Promise<ChatCompletionResponse> {
  let systemText = "";
  const conversationMessages: Array<{ role: string; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemText += (systemText ? "\n\n" : "") + msg.content;
    } else {
      conversationMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 16384,
    stream: false,
    messages: conversationMessages,
  };
  if (systemText) {
    body.system = systemText;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`http://localhost:${PROXY_MESSAGES_PORT}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": "proxy-mcp-internal",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Claude passthrough returned ${res.status}: ${errorText.slice(0, 200)}`);
    }

    const anthropicRes = await res.json() as Record<string, unknown>;
    return convertAnthropicResponseToChat(anthropicRes);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Claude passthrough timed out after ${PROXY_REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  }
}

/**
 * Convert an Anthropic Messages API response to our internal ChatCompletionResponse format.
 */
export function convertAnthropicResponseToChat(data: Record<string, unknown>): ChatCompletionResponse {
  const content = data.content as Array<Record<string, unknown>> | undefined;
  const textBlock = content?.find((b) => b.type === "text");
  const text = (textBlock?.text as string) ?? "";
  const usage = data.usage as Record<string, unknown> | undefined;

  return {
    id: (data.id as string) ?? `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: (data.model as string) ?? "unknown",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: (data.stop_reason as string) ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: (usage?.input_tokens as number) ?? 0,
      completion_tokens: (usage?.output_tokens as number) ?? 0,
      total_tokens: ((usage?.input_tokens as number) ?? 0) + ((usage?.output_tokens as number) ?? 0),
    },
  };
}

/**
 * Write current status to file for statusline integration.
 * Called on server startup and periodically.
 */
export function updateStatusFile(): void {
  try {
    ensureSessionDir();
    const statusPath = getSessionStatusPath();

    const status = {
      activeTasks: [],
      concurrency: { active: 0, limit: 0, queued: 0 },
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(statusPath, JSON.stringify(status, null, 2));
  } catch (error) {
    console.error("Failed to update status file:", error);
  }
}
