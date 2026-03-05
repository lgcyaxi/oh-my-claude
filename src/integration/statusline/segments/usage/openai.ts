/**
 * OpenAI / Codex usage fetcher for the statusline usage segment.
 *
 * Two auth paths:
 * - ChatGPT subscription ("chatgpt" authMethod): shows "Sub" (green) — quota-unlimited
 * - API key ("api_key" authMethod or OPENAI_API_KEY env): fetches credit balance
 *
 * Auth detection reads ~/.codex/auth.json directly (same store as codex app-server).
 * Falls back to null on any error — never throws.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ProviderCacheEntry } from "./types";
import { FETCH_TIMEOUT_MS } from "./types";
import { hasCredential } from "../../../../shared/auth/store";

interface CodexAuthFile {
  authMethod?: "chatgpt" | "api_key" | string | null;
  authToken?: string | null;
}

interface OpenAICreditGrants {
  total_granted: number;
  total_used: number;
  total_available: number;
  total_paid_credit_used: number;
}

function hasSharedOpenAICredential(): boolean {
  try {
    return hasCredential("openai");
  } catch {
    return false;
  }
}

/**
 * Read the codex auth file to detect OpenAI auth method.
 * Returns null if file is absent or unreadable.
 */
function readCodexAuth(): CodexAuthFile | null {
  try {
    const path = join(homedir(), ".codex", "auth.json");
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as CodexAuthFile;
  } catch {
    return null;
  }
}

/**
 * Fetch OpenAI credit balance for API-key users.
 */
async function fetchCreditBalance(apiKey: string): Promise<ProviderCacheEntry | null> {
  try {
    const resp = await fetch("https://api.openai.com/dashboard/billing/credit_grants", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as OpenAICreditGrants;
    const available = data.total_available ?? 0;
    const display = `$${available.toFixed(2)}`;

    let color: "good" | "warning" | "critical";
    if (available > 10) {
      color = "good";
    } else if (available > 2) {
      color = "warning";
    } else {
      color = "critical";
    }

    return { timestamp: Date.now(), display, color };
  } catch {
    return null;
  }
}

/**
 * Fetch OpenAI/Codex usage for the statusline.
 *
 * Returns:
 * - Subscription user: { display: "Sub", color: "good" }
 * - API key user: { display: "$12.30", color: "good"/"warning"/"critical" }
 * - Not configured / error: null
 */
export async function fetchOpenAIUsage(): Promise<ProviderCacheEntry | null> {
  try {
    // API key (local env) takes precedence and can show billable credit balance.
    const envKey = process.env.OPENAI_API_KEY;
    if (envKey) {
      return await fetchCreditBalance(envKey);
    }

    // oh-my-claude OAuth login stores OpenAI auth in auth.json.
    // This corresponds to ChatGPT/Codex subscription access.
    if (hasSharedOpenAICredential()) {
      return { timestamp: Date.now(), display: "Sub", color: "good" };
    }

    // Codex app auth file fallback.
    const auth = readCodexAuth();
    if (auth?.authMethod === "chatgpt") {
      return { timestamp: Date.now(), display: "Sub", color: "good" };
    }

    if (auth?.authMethod === "api_key" && auth.authToken) {
      return await fetchCreditBalance(auth.authToken);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if OpenAI/Codex is configured in this environment.
 */
export function isOpenAIConfigured(): boolean {
  try {
    if (process.env.OPENAI_API_KEY) return true;
    if (hasSharedOpenAICredential()) return true;
    const auth = readCodexAuth();
    return !!auth?.authMethod || !!auth?.authToken;
  } catch {
    return false;
  }
}
