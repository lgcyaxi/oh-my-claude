/**
 * proxy command — Manage live model switching (session-scoped)
 *
 * Per-session proxy is auto-managed by `oh-my-claude cc`.
 * This command provides: status, sessions, switch, revert.
 */

import type { Command } from "commander";
import { createFormatters } from "../utils/colors";
import { readProxyRegistry, cleanupStaleEntries, type ProxySessionEntry } from "../../proxy/registry";

/**
 * Extract session ID from ANTHROPIC_BASE_URL.
 * Matches paths like /s/{sessionId} in the URL.
 */
function extractProxySessionId(): string | undefined {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl) return undefined;

  try {
    const url = new URL(baseUrl);
    const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?/);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get session switch state from control API
 */
async function getSessionState(controlPort: number, sessionId: string): Promise<{
  switched: boolean;
  provider?: string;
  model?: string;
} | null> {
  try {
    const resp = await fetch(
      `http://localhost:${controlPort}/status?session=${sessionId}`,
      { signal: AbortSignal.timeout(1000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { switched?: boolean; provider?: string; model?: string };
    return {
      switched: data.switched ?? false,
      provider: data.provider,
      model: data.model,
    };
  } catch {
    return null;
  }
}

/**
 * Get proxy health from control API
 */
async function getProxyHealth(controlPort: number): Promise<{
  status: string;
  uptime?: number;
  requestCount?: number;
} | null> {
  try {
    const resp = await fetch(
      `http://localhost:${controlPort}/health`,
      { signal: AbortSignal.timeout(1000) }
    );
    if (!resp.ok) return null;
    return await resp.json() as { status: string; uptime?: number; requestCount?: number };
  } catch {
    return null;
  }
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * Format session age
 */
function formatAge(startedAt: number): string {
  const age = Math.floor((Date.now() - startedAt) / 1000);
  if (age < 60) return `${age}s`;
  if (age < 3600) return `${Math.floor(age / 60)}m`;
  return `${Math.floor(age / 3600)}h ${Math.floor((age % 3600) / 60)}m`;
}

/**
 * Enrich session entries with live state from control API
 */
async function enrichSessions(entries: ProxySessionEntry[]): Promise<Array<ProxySessionEntry & {
  state?: { switched: boolean; provider?: string; model?: string };
}>> {
  const results = await Promise.all(
    entries.map(async (entry) => {
      const state = await getSessionState(entry.controlPort, entry.sessionId);
      return { ...entry, state: state ?? undefined };
    })
  );
  return results;
}

export function registerProxyCommand(program: Command) {
  const proxyCmd = program
    .command("proxy")
    .description("Manage live model switching (per-session)")
    .allowUnknownOption(false)
    .action(async () => {
      const { c, ok, fail, dimText } = createFormatters();

      // Clean up stale entries first
      cleanupStaleEntries();

      // Read from registry file
      const entries = readProxyRegistry();

      console.log(`${c.bold}Proxy Status${c.reset}\n`);

      if (entries.length === 0) {
        console.log(fail("No active proxy sessions"));
        console.log(dimText("Proxy is auto-managed per session via 'oh-my-claude cc'"));
        console.log(`\n${c.bold}Usage:${c.reset}`);
        console.log(`  oh-my-claude cc                    ${c.dim}# Start Claude Code with proxy${c.reset}`);
        console.log(`  oh-my-claude proxy status          ${c.dim}# Show active sessions${c.reset}`);
        console.log(`  oh-my-claude proxy sessions        ${c.dim}# List all sessions${c.reset}`);
        console.log(`  oh-my-claude proxy switch <p> <m>  ${c.dim}# Switch active session model${c.reset}`);
        console.log(`  oh-my-claude proxy revert          ${c.dim}# Revert to native Claude${c.reset}`);
        return;
      }

      // Enrich with live state
      const enriched = await enrichSessions(entries);

      console.log(ok(`${enriched.length} active session${enriched.length > 1 ? 's' : ''}`));
      console.log(`\n${c.bold}Active Sessions${c.reset}\n`);

      for (const s of enriched) {
        const ageStr = formatAge(s.startedAt);
        const modeStr = s.state?.switched
          ? `${c.yellow}→ ${s.state.provider}/${s.state.model}${c.reset}`
          : `${c.green}native Claude${c.reset}`;

        console.log(`  ${c.cyan}${s.sessionId}${c.reset}  ${modeStr}  ${c.dim}port ${s.port}  ${ageStr}${c.reset}`);
      }

      console.log(`\n${dimText("Switch: oh-my-claude proxy switch <provider> <model> --session <id>")}`);
    });

  // Proxy status subcommand (alias for default action)
  proxyCmd
    .command("status")
    .description("Show proxy status and active sessions")
    .action(async () => {
      const { c, ok, fail, dimText } = createFormatters();

      cleanupStaleEntries();
      const entries = readProxyRegistry();

      console.log(`${c.bold}Proxy Status${c.reset}\n`);

      if (entries.length === 0) {
        console.log(fail("No active proxy"));
        console.log(dimText("Proxy is auto-managed per session via 'oh-my-claude cc'"));
        return;
      }

      const enriched = await enrichSessions(entries);

      console.log(ok(`${enriched.length} active session${enriched.length > 1 ? 's' : ''}`));
      console.log(`\n${c.bold}Active Sessions${c.reset}\n`);

      for (const s of enriched) {
        const ageStr = formatAge(s.startedAt);
        const modeStr = s.state?.switched
          ? `${c.yellow}→ ${s.state.provider}/${s.state.model}${c.reset}`
          : `${c.green}native Claude${c.reset}`;

        console.log(`  ${c.cyan}${s.sessionId}${c.reset}  ${modeStr}  ${c.dim}port ${s.port}  ${ageStr}${c.reset}`);
      }
    });

  // Proxy sessions subcommand — list active sessions (detailed)
  proxyCmd
    .command("sessions")
    .description("List all active proxy sessions with details")
    .action(async () => {
      const { c, ok, fail, dimText } = createFormatters();

      cleanupStaleEntries();
      const entries = readProxyRegistry();

      if (entries.length === 0) {
        console.log(dimText("No active sessions"));
        console.log(`\n${c.bold}Start a session:${c.reset}`);
        console.log(`  oh-my-claude cc  ${c.dim}# Launch Claude Code with proxy${c.reset}`);
        return;
      }

      const enriched = await enrichSessions(entries);

      console.log(`${c.bold}Active Sessions${c.reset} (${enriched.length})\n`);

      for (const s of enriched) {
        const ageStr = formatAge(s.startedAt);
        const modeStr = s.state?.switched
          ? `${c.yellow}→ ${s.state.provider}/${s.state.model}${c.reset}`
          : `${c.green}native Claude${c.reset}`;

        console.log(`  ${c.cyan}${s.sessionId}${c.reset}`);
        console.log(`    Mode:   ${modeStr}`);
        console.log(`    Port:   ${c.dim}${s.port}${c.reset} (proxy), ${c.dim}${s.controlPort}${c.reset} (control)`);
        console.log(`    PID:    ${c.dim}${s.pid}${c.reset}`);
        console.log(`    Age:    ${c.dim}${ageStr}${c.reset}`);
        if (s.cwd) console.log(`    CWD:    ${c.dim}${s.cwd}${c.reset}`);
      }

      console.log(`\n${dimText("Switch: oh-my-claude proxy switch <provider> <model> --session <id>")}`);
    });

  // Proxy switch subcommand — switch model for a session
  proxyCmd
    .command("switch [session] [model]")
    .description("Switch a session to use a different model (provider inferred from model name)")
    .action(async (sessionArg: string | undefined, modelArg: string | undefined) => {
      const { c, ok, fail, warn, dimText } = createFormatters();

      // Clean up stale entries and get sessions
      cleanupStaleEntries();
      const entries = readProxyRegistry();
      const enriched = await enrichSessions(entries);

      // Model -> Provider mapping (model prefix to provider)
      const modelToProvider: Record<string, string> = {
        "deepseek": "deepseek",
        "GLM": "zhipu",
        "glm": "zhipu",
        "MiniMax": "minimax",
        "K": "kimi",
        "gpt": "openai",
        "o3": "openai",
      };

      // Available models with their providers and shorthand aliases
      const availableModels = [
        { model: "deepseek-reasoner", alias: "ds-r", provider: "deepseek", label: "DeepSeek Reasoner" },
        { model: "deepseek-chat", alias: "ds-c", provider: "deepseek", label: "DeepSeek Chat" },
        { model: "GLM-5", alias: "zp", provider: "zhipu", label: "GLM-5" },
        { model: "glm-4v-flash", alias: "zp-v", provider: "zhipu", label: "GLM-4V Flash" },
        { model: "MiniMax-M2.5", alias: "mm", provider: "minimax", label: "MiniMax M2.5" },
        { model: "K2.5", alias: "kimi", provider: "kimi", label: "Kimi K2.5" },
        { model: "gpt-5.3-codex", alias: "codex", provider: "openai", label: "GPT-5.3 Codex (OAuth)" },
      ];

      // Show available sessions and models when called without args
      if (!sessionArg || !modelArg) {
        console.log(`${c.bold}Sessions${c.reset}`);
        if (enriched.length === 0) {
          console.log(fail("No active sessions"));
          console.log(dimText("Start a session with: oh-my-claude cc"));
        } else {
          for (const s of enriched) {
            const modeStr = s.state?.switched
              ? `${c.yellow}${s.state.provider}/${s.state.model}${c.reset}`
              : `${c.green}native Claude${c.reset}`;
            console.log(`  ${c.cyan}${s.sessionId.slice(0, 8)}${c.reset}  ${modeStr}`);
          }
        }

        console.log(`\n${c.bold}Available Models${c.reset}\n`);
        const maxAliasLen = Math.max(...availableModels.map(m => m.alias.length));
        const maxModelLen = Math.max(...availableModels.map(m => m.model.length));
        for (const m of availableModels) {
          console.log(`  ${c.yellow}${m.alias.padEnd(maxAliasLen)}${c.reset}  ${c.cyan}${m.model.padEnd(maxModelLen)}${c.reset}  ${m.label}`);
        }

        console.log(`\n${c.bold}Usage:${c.reset}`);
        console.log(`  oh-my-claude proxy switch <session> <model|alias>`);
        console.log(`\n${c.bold}Examples:${c.reset}`);
        console.log(`  oh-my-claude proxy switch 505a GLM-5`);
        console.log(`  oh-my-claude proxy switch 505 ds-r`);
        return;
      }

      // Find session by partial ID match
      const matchedSession = enriched.find(s =>
        s.sessionId === sessionArg || s.sessionId.startsWith(sessionArg)
      );

      if (!matchedSession) {
        console.log(fail(`Session "${sessionArg}" not found`));
        console.log(dimText("Available sessions:"));
        for (const s of enriched) {
          console.log(`  ${s.sessionId.slice(0, 8)}`);
        }
        process.exit(1);
      }

      // Find model by alias (exact) or model name (prefix match)
      const modelArgLower = modelArg.toLowerCase();
      const matchedModelInfo =
        availableModels.find(m => m.alias.toLowerCase() === modelArgLower) ||
        availableModels.find(m => m.model.toLowerCase().startsWith(modelArgLower));

      if (!matchedModelInfo) {
        console.log(fail(`Unknown model: "${modelArg}"`));
        console.log(dimText("Available models (alias → model):"));
        for (const m of availableModels) {
          console.log(`  ${m.alias} → ${m.model}`);
        }
        process.exit(1);
      }

      const { provider, model } = matchedModelInfo;

      // Call control API to switch
      try {
        const resp = await fetch(
          `http://localhost:${matchedSession.controlPort}/switch?session=${matchedSession.sessionId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, model }),
            signal: AbortSignal.timeout(2000),
          }
        );

        if (!resp.ok) {
          console.log(fail(`Switch failed: ${resp.statusText}`));
          process.exit(1);
        }

        console.log(ok(`Switched to ${c.cyan}${provider}/${model}${c.reset}`));
        console.log(`  Session: ${c.cyan}${matchedSession.sessionId}${c.reset}`);
        console.log(`\n${dimText("Use 'oh-my-claude proxy revert' to return to native Claude.")}`);
      } catch (e) {
        console.log(fail("Failed to connect to proxy control API"));
        console.log(dimText("Make sure you're running within 'oh-my-claude cc' session"));
        process.exit(1);
      }
    });

  // Proxy revert subcommand — revert to native Claude
  proxyCmd
    .command("revert [session]")
    .description("Revert session to native Claude (passthrough mode)")
    .action(async (sessionArg: string | undefined) => {
      const { c, ok, fail, dimText } = createFormatters();

      // Clean up stale entries and get sessions
      cleanupStaleEntries();
      const entries = readProxyRegistry();

      if (entries.length === 0) {
        console.log(fail("No active sessions"));
        console.log(dimText("Run 'oh-my-claude cc' to start a session"));
        process.exit(1);
      }

      // Find session
      let matchedSession: ProxySessionEntry | undefined;

      if (sessionArg) {
        // Find by partial ID match
        matchedSession = entries.find(s =>
          s.sessionId === sessionArg || s.sessionId.startsWith(sessionArg)
        );
        if (!matchedSession) {
          console.log(fail(`Session "${sessionArg}" not found`));
          console.log(dimText("Available sessions:"));
          for (const s of entries) {
            console.log(`  ${s.sessionId.slice(0, 8)}`);
          }
          process.exit(1);
        }
      } else {
        // Auto-detect from env or use single session
        const envSessionId = extractProxySessionId();
        if (envSessionId) {
          matchedSession = entries.find(s => s.sessionId === envSessionId);
        } else if (entries.length === 1) {
          matchedSession = entries[0];
        } else {
          // Multiple sessions, show list
          const enriched = await enrichSessions(entries);
          console.log(fail("Multiple sessions active. Specify session ID."));
          console.log(dimText("Available sessions:"));
          for (const s of enriched) {
            const modeStr = s.state?.switched
              ? `${c.yellow}${s.state.provider}/${s.state.model}${c.reset}`
              : `${c.green}native Claude${c.reset}`;
            console.log(`  ${c.cyan}${s.sessionId.slice(0, 8)}${c.reset}  ${modeStr}`);
          }
          process.exit(1);
        }
      }

      if (!matchedSession) {
        console.log(fail("No session detected."));
        process.exit(1);
      }

      try {
        const resp = await fetch(
          `http://localhost:${matchedSession.controlPort}/revert?session=${matchedSession.sessionId}`,
          {
            method: "POST",
            signal: AbortSignal.timeout(2000),
          }
        );

        if (!resp.ok) {
          console.log(fail(`Revert failed: ${resp.statusText}`));
          process.exit(1);
        }

        console.log(ok("Reverted to native Claude"));
        console.log(`  Session: ${c.cyan}${matchedSession.sessionId}${c.reset}`);
      } catch {
        console.log(fail("Failed to connect to proxy control API"));
        console.log(dimText("Make sure you're running within 'oh-my-claude cc' session"));
        process.exit(1);
      }
    });
}
