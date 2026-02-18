/**
 * Secure auth credential storage
 *
 * Stores OAuth credentials in ~/.claude/oh-my-claude/auth.json
 * with restricted file permissions (0600).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { AuthStoreSchema, type AuthStore, type AuthCredential } from "./types";

const AUTH_DIR = join(homedir(), ".claude", "oh-my-claude");
const AUTH_PATH = join(AUTH_DIR, "auth.json");

/**
 * Ensure auth directory exists
 */
function ensureAuthDir(): void {
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }
}

/**
 * Set restrictive file permissions (0600) - skip on Windows
 */
function setFilePermissions(path: string): void {
  if (platform() === "win32") return;
  try {
    chmodSync(path, 0o600);
  } catch {
    // Graceful degradation on permission errors
  }
}

/**
 * Load the full auth store from disk
 */
export function loadAuthStore(): AuthStore {
  try {
    if (!existsSync(AUTH_PATH)) {
      return { version: 1, credentials: {} };
    }
    const content = readFileSync(AUTH_PATH, "utf-8");
    const parsed = JSON.parse(content);
    return AuthStoreSchema.parse(parsed);
  } catch {
    return { version: 1, credentials: {} };
  }
}

/**
 * Save the full auth store to disk
 */
export function saveAuthStore(store: AuthStore): void {
  ensureAuthDir();
  const content = JSON.stringify(store, null, 2);
  writeFileSync(AUTH_PATH, content, "utf-8");
  setFilePermissions(AUTH_PATH);
}

/**
 * Get credential for a specific provider
 */
export function getCredential(provider: string): AuthCredential | null {
  const store = loadAuthStore();
  return store.credentials[provider] ?? null;
}

/**
 * Set credential for a provider (creates or updates)
 */
export function setCredential(provider: string, credential: AuthCredential): void {
  const store = loadAuthStore();
  store.credentials[provider] = credential;
  saveAuthStore(store);
}

/**
 * Remove credential for a provider
 */
export function removeCredential(provider: string): boolean {
  const store = loadAuthStore();
  if (!(provider in store.credentials)) {
    return false;
  }
  delete store.credentials[provider];
  saveAuthStore(store);
  return true;
}

/**
 * List all stored credentials (provider names and types)
 */
export function listCredentials(): Array<{ provider: string; type: string; detail: string }> {
  const store = loadAuthStore();
  return Object.entries(store.credentials).map(([provider, cred]) => {
    let detail = "";
    switch (cred.type) {
      case "oauth-openai":
        detail = cred.accountId ? `account: ${cred.accountId}` : "authenticated";
        break;
    }
    return { provider, type: cred.type, detail };
  });
}

/**
 * Check if a provider has stored credentials
 */
export function hasCredential(provider: string): boolean {
  const store = loadAuthStore();
  return provider in store.credentials;
}

/**
 * Get the auth store file path (for display in CLI)
 */
export function getAuthStorePath(): string {
  return AUTH_PATH;
}
