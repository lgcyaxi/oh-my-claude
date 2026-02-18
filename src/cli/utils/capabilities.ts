/**
 * Capability detection for external CLI tools
 *
 * Detects availability of OpenCode, Codex CLI, and other external tools
 * to enable dynamic agent routing based on installed capabilities.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { getCredential } from "../../auth/store";
import { loadConfig } from "../../config/loader";

/**
 * Capability flags for external tools
 */
export interface Capabilities {
  /** OpenCode CLI is installed and available */
  opencode: boolean;
  /** Codex CLI is installed and available */
  codex: boolean;
  /** MCP agents are available (MCP server running) */
  mcp: boolean;
  /** OAuth providers configured */
  openaiAuth: boolean;
  minimaxAuth: boolean;
  /** API key providers configured */
  deepseek: boolean;
  zhipu: boolean;
  minimax: boolean;
  kimi: boolean;
}

let cachedCapabilities: Capabilities | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000; // 30 second cache

/**
 * Check if a CLI command exists in PATH
 */
function commandExists(command: string): boolean {
  try {
    const checkCmd = process.platform === "win32" ? "where" : "which";
    execSync(`${checkCmd} ${command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect all capabilities
 * Results are cached for 30 seconds to avoid repeated checks
 */
export function detectCapabilities(): Capabilities {
  const now = Date.now();
  if (cachedCapabilities && now - cachedAt < CACHE_TTL_MS) {
    return cachedCapabilities;
  }

  const config = loadConfig();

  // Check external CLI tools
   const opencode = commandExists("opencode");
   const codex = commandExists("codex") || commandExists("codex-cli");

   // Check OAuth providers
  const openaiAuth = !!getCredential("openai");
  const minimaxAuth = !!getCredential("minimax");

  // Check API key providers (check env vars)
  const deepseek = !!process.env.DEEPSEEK_API_KEY;
  const zhipu = !!process.env.ZHIPU_API_KEY;
  const minimax = !!process.env.MINIMAX_API_KEY;
  const kimi = !!process.env.KIMI_API_KEY;

  // MCP is available if any API provider is configured
  const mcp = deepseek || zhipu || minimax || kimi || openaiAuth;

   cachedCapabilities = {
     opencode,
     codex,
     mcp,
     openaiAuth,
     minimaxAuth,
     deepseek,
     zhipu,
     minimax,
     kimi,
   };

  cachedAt = now;
  return cachedCapabilities;
}

/**
 * Clear capability cache (useful after auth changes)
 */
export function clearCapabilityCache(): void {
  cachedCapabilities = null;
  cachedAt = 0;
}

/**
 * Get human-readable capability summary
 */
export function getCapabilitySummary(): string {
  const caps = detectCapabilities();

   const lines: string[] = [];
   lines.push("CLI Agents:");
   lines.push(`  OpenCode: ${caps.opencode ? "✓" : "✗"}`);
   lines.push(`  Codex CLI: ${caps.codex ? "✓" : "✗"}`);
   lines.push("");
   lines.push("Infrastructure:");
   lines.push(`  MCP Server: ${caps.mcp ? "✓" : "✗"}`);
   lines.push("");
   lines.push("Providers:");
  lines.push(`  DeepSeek: ${caps.deepseek ? "✓" : "✗"}`);
  lines.push(`  ZhiPu: ${caps.zhipu ? "✓" : "✗"}`);
  lines.push(`  MiniMax: ${caps.minimax ? "✓" : "✗"}`);
  lines.push(`  Kimi: ${caps.kimi ? "✓" : "✗"}`);
  lines.push("");
  lines.push("OAuth:");
  lines.push(`  OpenAI: ${caps.openaiAuth ? "✓" : "✗"}`);
  lines.push(`  MiniMax (quota display only): ${caps.minimaxAuth ? "✓" : "✗"}`);

  return lines.join("\n");
}

/**
 * Check if specific capability is available
 */
export function hasCapability(capability: keyof Capabilities): boolean {
  return detectCapabilities()[capability];
}

/**
 * Get available external CLI tools
 */
export function getAvailableCliTools(): string[] {
  const caps = detectCapabilities();
  const tools: string[] = [];
  if (caps.opencode) tools.push("opencode");
  if (caps.codex) tools.push("codex");
  return tools;
}
