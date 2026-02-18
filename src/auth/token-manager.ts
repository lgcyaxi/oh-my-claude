/**
 * Token lifecycle manager
 *
 * In-memory cache of access tokens with automatic refresh.
 * Uses promise dedup to prevent concurrent refresh races.
 */

import { getCredential, setCredential } from "./store";
import type { AuthCredential } from "./types";

// In-memory access token cache
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

// Promise dedup: prevent concurrent refreshes for same provider
const refreshPromises = new Map<string, Promise<string>>();

const EXPIRY_BUFFER_MS = 60_000; // Refresh 60s before actual expiry

/**
 * Check if a cached token is still valid
 */
function isExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt - EXPIRY_BUFFER_MS;
}

/**
 * Get a valid access token for a provider.
 * Returns cached token if valid, otherwise refreshes.
 */
export async function getAccessToken(provider: string): Promise<string> {
  // Check in-memory cache first
  const cached = tokenCache.get(provider);
  if (cached && !isExpired(cached.expiresAt)) {
    return cached.token;
  }

  // Refresh with dedup
  const existing = refreshPromises.get(provider);
  if (existing) return existing;

  const promise = refreshAccessToken(provider);
  refreshPromises.set(provider, promise);

  try {
    const token = await promise;
    return token;
  } finally {
    refreshPromises.delete(provider);
  }
}

/**
 * Refresh an access token for a provider.
 * Dispatches to provider-specific refresh logic.
 */
async function refreshAccessToken(provider: string): Promise<string> {
  const cred = getCredential(provider);
  if (!cred) {
    throw new Error(`No credentials stored for provider: ${provider}. Run 'oh-my-claude auth login ${provider}'.`);
  }

  switch (cred.type) {
    case "oauth-openai":
      return refreshOpenAI(provider, cred);
    default:
      throw new Error(`Unknown credential type for provider: ${provider}`);
  }
}

/**
 * Refresh OpenAI access token
 */
async function refreshOpenAI(
  provider: string,
  cred: Extract<AuthCredential, { type: "oauth-openai" }>
): Promise<string> {
  // Check if stored access token is still valid
  if (cred.accessToken && !isExpired(cred.expiresAt)) {
    tokenCache.set(provider, { token: cred.accessToken, expiresAt: cred.expiresAt });
    return cred.accessToken;
  }

  const response = await fetch("https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cred.refreshToken,
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI token refresh failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  };

  const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  tokenCache.set(provider, { token: data.access_token, expiresAt });

  // Persist updated tokens
  setCredential(provider, {
    ...cred,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  });

  return data.access_token;
}

/**
 * Clear cached tokens (e.g., after logout)
 */
export function clearTokenCache(provider?: string): void {
  if (provider) {
    tokenCache.delete(provider);
  } else {
    tokenCache.clear();
  }
}

/**
 * Force refresh a token (bypass cache)
 */
export async function forceRefresh(provider: string): Promise<string> {
  tokenCache.delete(provider);
  return getAccessToken(provider);
}
