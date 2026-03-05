import { loadConfig } from "../../shared/config";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * Parse a value that might be a stringified JSON array.
 * MCP sometimes passes arrays as JSON strings.
 */
export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      // Not a JSON string
    }
    return [value];
  }
  return [];
}

/**
 * Extract session ID from ANTHROPIC_BASE_URL environment variable.
 *
 * When `oh-my-claude cc` launches Claude Code in proxy mode, it sets
 * ANTHROPIC_BASE_URL to `http://localhost:18910/s/{sessionId}`.
 * The MCP server inherits this env var and can extract the session ID
 * to scope switch operations to the current session.
 *
 * @returns session ID string, or undefined if no session prefix
 */
export function extractSessionIdFromEnv(): string | undefined {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl) return undefined;

  try {
    const url = new URL(baseUrl);
    const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get the configured default write scope from oh-my-claude.json.
 * Falls through to auto-detect when set to "auto" or not configured.
 */
export function getConfiguredWriteScope(): string | undefined {
  try {
    const config = loadConfig();
    return config.memory?.defaultWriteScope;
  } catch {
    return undefined;
  }
}

/**
 * Resolve project root for memory isolation.
 * The MCP server is spawned per-instance by Claude Code with the project as cwd.
 * We walk up from cwd to find the .git root, same as store.ts's findProjectRoot().
 */
export function resolveProjectRoot(): string | undefined {
  let dir = process.cwd();

  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return undefined;
}
