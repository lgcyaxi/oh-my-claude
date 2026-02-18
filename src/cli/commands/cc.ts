/**
 * CC command — Launch Claude Code with per-session proxy or direct provider connection
 *
 * Each `oh-my-claude cc` invocation spawns its own proxy on dynamic ports.
 * When a terminal multiplexer is available (WezTerm/tmux), Claude Code launches
 * in a new window and the current terminal returns immediately.
 *
 * Subcommands:
 *   cc list          — List active CC sessions
 *   cc stop [id]     — Stop a CC session (kill proxy + terminal pane)
 */

import type { Command } from "commander";
import { spawn, spawnSync, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createFormatters } from "../utils/colors";
import { spawnSessionProxy, spawnDetachedProxy, findFreePorts } from "../utils/proxy-lifecycle";
import {
  registerProxySession,
  unregisterProxySession,
  readProxyRegistry,
  cleanupStaleEntries,
} from "../../proxy/registry";
import { detectTerminal, type DetectedTerminal } from "../utils/terminal-detect";

/** Provider alias → { name, baseUrl, apiKeyEnv } */
const PROVIDER_MAP: Record<string, { name: string; baseUrl: string; apiKeyEnv: string }> = {
  ds:         { name: "DeepSeek",   baseUrl: "https://api.deepseek.com/anthropic",       apiKeyEnv: "DEEPSEEK_API_KEY" },
  deepseek:   { name: "DeepSeek",   baseUrl: "https://api.deepseek.com/anthropic",       apiKeyEnv: "DEEPSEEK_API_KEY" },
  zp:         { name: "ZhiPu",      baseUrl: "https://open.bigmodel.cn/api/anthropic",   apiKeyEnv: "ZHIPU_API_KEY" },
  zhipu:      { name: "ZhiPu",      baseUrl: "https://open.bigmodel.cn/api/anthropic",   apiKeyEnv: "ZHIPU_API_KEY" },
  mm:         { name: "MiniMax",     baseUrl: "https://api.minimaxi.com/anthropic",       apiKeyEnv: "MINIMAX_API_KEY" },
  minimax:    { name: "MiniMax",     baseUrl: "https://api.minimaxi.com/anthropic",       apiKeyEnv: "MINIMAX_API_KEY" },
  km:         { name: "Kimi",        baseUrl: "https://api.kimi.com/coding",              apiKeyEnv: "KIMI_API_KEY" },
  kimi:       { name: "Kimi",        baseUrl: "https://api.kimi.com/coding",              apiKeyEnv: "KIMI_API_KEY" },
};

export function registerCcCommand(program: Command) {
  const ccCmd = program
    .command("cc")
    .description("Launch Claude Code with per-session proxy or direct provider connection")
    .argument("[claude-args...]", "Arguments to pass through to claude (e.g. --resume, -c 'prompt')")
    .option("-p, --provider <alias>", "Connect directly to provider (ds/zp/mm/km)")
    .option("-t, --terminal <mode>", "Terminal launch mode: none (inline), auto, wezterm, tmux", process.platform === "win32" ? "auto" : "none")
    .option("-d, --debug", "Enable proxy debug mode (logs to ~/.claude/oh-my-claude/proxy-{session}.log)")
    .allowUnknownOption(true);

  // Enable passThroughOptions so unknown flags like --resume go to claude, not error
  program.enablePositionalOptions(true);
  ccCmd.passThroughOptions(true);

  // --- Subcommand: cc list ---
  ccCmd
    .command("list")
    .description("List active CC sessions")
    .action(() => {
      const { c, ok, fail, dimText } = createFormatters();

      cleanupStaleEntries();
      const entries = readProxyRegistry();

      if (entries.length === 0) {
        console.log(dimText("No active CC sessions."));
        return;
      }

      console.log(ok(`Active CC sessions (${entries.length}):\n`));
      for (const entry of entries) {
        const age = formatAge(entry.startedAt);
        const terminal = entry.terminalBackend ? `[${entry.terminalBackend}]` : "[inline]";
        const detachedLabel = entry.detached ? " (detached)" : "";
        console.log(
          `  ${c.cyan}${entry.sessionId}${c.reset}  ` +
          `port=${entry.port}  pid=${entry.pid}  ${terminal}${detachedLabel}  ${age}`
        );
        if (entry.cwd) {
          console.log(`    ${dimText(entry.cwd)}`);
        }
      }
    });

  // --- Subcommand: cc stop ---
  ccCmd
    .command("stop [sessionId]")
    .description("Stop a CC session (kill proxy + terminal pane)")
    .action((sessionId?: string) => {
      const { c, ok, fail, dimText } = createFormatters();

      cleanupStaleEntries();
      const entries = readProxyRegistry();

      if (entries.length === 0) {
        console.log(dimText("No active CC sessions."));
        return;
      }

      // If no sessionId given, stop the most recent one
      let target = sessionId
        ? entries.find((e) => e.sessionId === sessionId || e.sessionId.startsWith(sessionId))
        : entries[entries.length - 1];

      if (!target) {
        console.log(fail(`Session "${sessionId}" not found.`));
        console.log(dimText(`Active sessions: ${entries.map((e) => e.sessionId).join(", ")}`));
        return;
      }

      // Kill proxy process
      try {
        process.kill(target.pid, "SIGTERM");
        console.log(ok(`Killed proxy (PID: ${target.pid})`));
      } catch {
        console.log(dimText(`Proxy (PID: ${target.pid}) already dead`));
      }

      // Kill terminal pane if tracked
      if (target.paneId && target.terminalBackend) {
        try {
          killTerminalPane(target.terminalBackend, target.paneId);
          console.log(ok(`Closed ${target.terminalBackend} pane (${target.paneId})`));
        } catch {
          console.log(dimText(`Terminal pane cleanup skipped`));
        }
      }

      unregisterProxySession(target.sessionId);
      console.log(ok(`Session ${c.cyan}${target.sessionId}${c.reset} stopped.`));
    });

  // --- Main action: launch Claude Code ---
  ccCmd.action(async (claudeArgs: string[], options) => {
    const { c, ok, fail, dimText } = createFormatters();

    // --- Mode A: Direct provider connection (no proxy needed) ---
    if (options.provider) {
      const alias = options.provider.toLowerCase();
      const provider = PROVIDER_MAP[alias];

      if (!provider) {
        console.log(fail(`Unknown provider alias: "${options.provider}"`));
        console.log(dimText(`Available: ds, zp, mm, km (or full names)`));
        process.exit(1);
      }

      // Check API key
      const apiKey = process.env[provider.apiKeyEnv];
      if (!apiKey) {
        console.log(fail(`${provider.apiKeyEnv} not set`));
        console.log(dimText(`Set it in your shell: export ${provider.apiKeyEnv}=your-key`));
        process.exit(1);
      }

      const argsLabel = claudeArgs.length > 0 ? ` (${claudeArgs.join(" ")})` : "";
      console.log(ok(`Provider: ${c.cyan}${provider.name}${c.reset} → ${dimText(provider.baseUrl)}`));
      console.log(ok(`Launching Claude Code${argsLabel}...\n`));

      const result = spawnSync("claude", claudeArgs, {
        stdio: "inherit",
        env: {
          ...process.env,
          ANTHROPIC_BASE_URL: provider.baseUrl,
          ANTHROPIC_API_KEY: apiKey,
        },
        shell: true,
      });

      process.exit(result.status ?? 0);
    }

    // --- Mode B: Per-session proxy ---

    // 1. Allocate dynamic ports for this session
    let ports: { port: number; controlPort: number };
    try {
      ports = await findFreePorts();
    } catch (err) {
      console.log(fail("Failed to allocate ports for session proxy."));
      process.exit(1);
    }

    const debug = !!options.debug;
    const terminalMode: string = options.terminal ?? "auto";

    console.log(dimText(`  Proxy ports: ${ports.port} (proxy) / ${ports.controlPort} (control)`));
    if (debug) {
      console.log(dimText(`  Debug mode: proxy logs enabled`));
    }

    // 2. Generate session ID
    const sessionId = randomBytes(4).toString("hex");

    // 3. Detect terminal backend
    let terminal: DetectedTerminal = null;

    if (terminalMode === "none") {
      terminal = null;
    } else if (terminalMode === "wezterm") {
      terminal = "wezterm";
    } else if (terminalMode === "tmux") {
      terminal = "tmux";
    } else {
      // auto-detect
      terminal = await detectTerminal();
    }

    // 4. Build session-scoped base URL
    const baseUrl = `http://localhost:${ports.port}/s/${sessionId}`;

    // --- Terminal launch path (detached) ---
    if (terminal) {
      console.log(ok(`Terminal: ${c.cyan}${terminal}${c.reset}`));

      // Spawn proxy as detached daemon
      const proxyResult = await spawnDetachedProxy({ ...ports, debug, sessionId });

      if (!proxyResult) {
        console.log(fail("Proxy server script not found."));
        console.log(dimText("Run 'oh-my-claude install' first."));
        process.exit(1);
      }

      if (!proxyResult.healthy) {
        console.log(fail("Per-session proxy failed to start within 3s."));
        try { process.kill(proxyResult.pid, "SIGTERM"); } catch {}
        process.exit(1);
      }

      console.log(ok(`Proxy started (PID: ${proxyResult.pid}, detached)`));
      if (debug && proxyResult.logFile) {
        console.log(dimText(`  Log: ${proxyResult.logFile}`));
      }

      // Build env + claude command for terminal
      const claudeArgsStr = claudeArgs.length > 0 ? " " + claudeArgs.join(" ") : "";

      let paneId: string | undefined;

      const cwd = process.cwd();

      if (terminal === "wezterm") {
        paneId = launchInWezterm(baseUrl, ports.controlPort, claudeArgsStr, debug, cwd);
      } else if (terminal === "tmux") {
        paneId = launchInTmux(sessionId, baseUrl, ports.controlPort, claudeArgsStr, debug, cwd);
      }

      // Register session with terminal info
      registerProxySession({
        sessionId,
        port: ports.port,
        controlPort: ports.controlPort,
        pid: proxyResult.pid,
        startedAt: Date.now(),
        cwd: process.cwd(),
        paneId,
        terminalBackend: terminal,
        detached: true,
      });

      const argsLabel = claudeArgs.length > 0 ? ` (${claudeArgs.join(" ")})` : "";
      const launchTarget = (terminal === "wezterm" && process.env.WEZTERM_PANE) ? "tab" : "window";
      console.log(ok(`Session: ${c.cyan}${sessionId}${c.reset}`));
      console.log(ok(`Claude Code launched in ${terminal} ${launchTarget}${argsLabel}`));
      console.log(dimText(`\n  Stop session: oh-my-claude cc stop ${sessionId}`));
      console.log(dimText(`  List sessions: oh-my-claude cc list`));
      return;
    }

    // --- Inline fallback path (attached) ---
    if (terminalMode === "auto") {
      console.log(dimText("  No terminal multiplexer found (wezterm/tmux), launching inline..."));
    }

    // Spawn per-session proxy as child (dies with CC)
    const proxyResult = await spawnSessionProxy({ ...ports, debug, sessionId });

    if (!proxyResult) {
      console.log(fail("Proxy server script not found."));
      console.log(dimText("Run 'oh-my-claude install' first."));
      process.exit(1);
    }

    if (!proxyResult.healthy) {
      console.log(fail("Per-session proxy failed to start within 3s."));
      proxyResult.child.kill();
      process.exit(1);
    }

    console.log(ok(`Proxy started (PID: ${proxyResult.child.pid})`));
    if (debug && proxyResult.logFile) {
      console.log(dimText(`  Log: ${proxyResult.logFile}`));
    }

    // Register session
    registerProxySession({
      sessionId,
      port: ports.port,
      controlPort: ports.controlPort,
      pid: proxyResult.child.pid!,
      startedAt: Date.now(),
      cwd: process.cwd(),
    });

    // Cleanup helper
    const cleanup = () => {
      unregisterProxySession(sessionId);
      proxyResult.child.kill();
    };

    process.on("SIGINT", () => { cleanup(); process.exit(130); });
    process.on("SIGTERM", () => { cleanup(); process.exit(143); });

    const argsLabel = claudeArgs.length > 0 ? ` (${claudeArgs.join(" ")})` : "";
    console.log(ok(`Session: ${c.cyan}${sessionId}${c.reset}`));

    // Check if tmux is available for inline wrapping (Git Bash on Windows, or macOS/Linux)
    const useTmuxInline = await shouldUseTmuxInline();

    if (useTmuxInline) {
      console.log(ok(`Launching Claude Code in tmux session${argsLabel}...\n`));

      const tmuxSession = `omc-cc-${sessionId}`;
      const envPrefix = [
        `ANTHROPIC_BASE_URL=${baseUrl}`,
        `OMC_PROXY_CONTROL_PORT=${ports.controlPort}`,
        ...(debug ? ["OMC_DEBUG=1"] : []),
      ].join(" ");
      const claudeCmd = `claude${claudeArgs.length > 0 ? " " + claudeArgs.join(" ") : ""}`;
      const shellCmd = `${envPrefix} ${claudeCmd}`;

      // Foreground tmux session (attached, user sees it in current terminal)
      const result = spawnSync("tmux", [
        "new-session", "-s", tmuxSession, shellCmd,
      ], {
        stdio: "inherit",
        env: process.env,
      });

      cleanup();
      process.exit(result.status ?? 0);
    }

    console.log(ok(`Launching Claude Code${argsLabel}...\n`));

    const result = spawnSync("claude", claudeArgs, {
      stdio: "inherit",
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: baseUrl,
        OMC_PROXY_CONTROL_PORT: String(ports.controlPort),
        ...(debug ? { OMC_DEBUG: "1" } : {}),
      },
      shell: true,
    });

    cleanup();
    process.exit(result.status ?? 0);
  });
}

// ─── Terminal launchers ──────────────────────────────────────────────

/**
 * Check whether the WezTerm mux server is reachable.
 * `wezterm cli list` succeeds only when a mux server is running.
 */
function isWezTermMuxAvailable(): boolean {
  try {
    const result = spawnSync("wezterm", ["cli", "list"], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 5_000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Launch Claude Code in WezTerm.
 *
 * Three modes:
 * - Inside WezTerm (mux available + $WEZTERM_PANE): `wezterm cli spawn`
 *   → new tab in current window, returns pane ID
 * - WezTerm mux available (but not inside it): `wezterm cli spawn --new-window`
 *   → new WezTerm window, returns pane ID
 * - Outside WezTerm (Git Bash, etc.): `wezterm start --always-new-process`
 *   → spawns a new WezTerm GUI window directly (no pane ID)
 */
function launchInWezterm(
  baseUrl: string,
  controlPort: number,
  claudeArgsStr: string,
  debug: boolean,
  cwd: string,
): string | undefined {
  const isWindows = process.platform === "win32";
  const muxAvailable = isWezTermMuxAvailable();
  // If $WEZTERM_PANE is set, we're running inside WezTerm → new tab, not new window
  const insideWezTerm = !!process.env.WEZTERM_PANE;

  if (isWindows) {
    // Build cmd.exe /k command — sets env vars then launches claude
    const envParts = [
      `set ANTHROPIC_BASE_URL=${baseUrl}`,
      `set OMC_PROXY_CONTROL_PORT=${controlPort}`,
      // Unset CLAUDECODE so Claude Code doesn't think it's nested
      "set CLAUDECODE=",
      ...(debug ? ["set OMC_DEBUG=1"] : []),
    ];
    const shellCmd = `${envParts.join(" && ")} && claude${claudeArgsStr}`;

    if (muxAvailable) {
      // Mux server reachable — use cli spawn (returns pane ID)
      // If inside WezTerm, spawn a new tab; otherwise spawn a new window
      const spawnArgs = insideWezTerm
        ? ["cli", "spawn", "--cwd", cwd, "--", "cmd.exe", "/k", shellCmd]
        : ["cli", "spawn", "--new-window", "--cwd", cwd, "--", "cmd.exe", "/k", shellCmd];
      try {
        const result = spawnSync("wezterm", spawnArgs, {
          encoding: "utf-8",
          windowsHide: true,
        });
        const stdout = (result.stdout ?? "").trim();
        if (/^\d+$/.test(stdout)) {
          return stdout;
        }
      } catch { /* fall through */ }
    }

    // Outside WezTerm (Git Bash, etc.) — use wezterm start
    // Use spawn (detached) instead of spawnSync to avoid blocking + window suppression
    try {
      const child = spawn(
        "wezterm",
        ["start", "--always-new-process", "--cwd", cwd, "--", "cmd.exe", "/k", shellCmd],
        { detached: true, stdio: "ignore" },
      );
      child.unref();
      // wezterm start doesn't return a pane ID
    } catch { /* best effort */ }

    return undefined;
  }

  // --- Unix path ---
  const envParts = [
    `ANTHROPIC_BASE_URL=${baseUrl}`,
    `OMC_PROXY_CONTROL_PORT=${controlPort}`,
    ...(debug ? ["OMC_DEBUG=1"] : []),
  ];
  const shellCmd = `cd '${cwd.replace(/'/g, "'\\''")}' && unset CLAUDECODE && ${envParts.join(" ")} claude${claudeArgsStr}`;

  if (muxAvailable) {
    const newWindowFlag = insideWezTerm ? "" : " --new-window";
    try {
      const stdout = execSync(
        `wezterm cli spawn${newWindowFlag} --cwd "${cwd}" -- bash -c '${shellCmd.replace(/'/g, "'\\''")}'`,
        { encoding: "utf-8" },
      ).trim();
      if (/^\d+$/.test(stdout)) {
        return stdout;
      }
    } catch { /* fall through */ }
  }

  // Fallback: wezterm start
  try {
    const child = spawn(
      "wezterm",
      ["start", "--always-new-process", "--cwd", cwd, "--", "bash", "-c", shellCmd],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
  } catch { /* best effort */ }

  return undefined;
}

/**
 * Launch Claude Code in a new tmux session.
 * Session name: omc-cc-<sessionId>
 */
function launchInTmux(
  sessionId: string,
  baseUrl: string,
  controlPort: number,
  claudeArgsStr: string,
  debug: boolean,
  cwd: string,
): string | undefined {
  const tmuxSession = `omc-cc-${sessionId}`;
  const escapedCwd = cwd.replace(/'/g, "'\\''");
  const envParts = [
    `ANTHROPIC_BASE_URL=${baseUrl}`,
    `OMC_PROXY_CONTROL_PORT=${controlPort}`,
    ...(debug ? ["OMC_DEBUG=1"] : []),
  ];
  const shellCmd = `cd '${escapedCwd}' && ${envParts.join(" ")} claude${claudeArgsStr}`;

  try {
    execSync(`tmux new-session -d -s ${tmuxSession} -c '${escapedCwd}' '${shellCmd.replace(/'/g, "'\\''")}'`, {
      encoding: "utf-8",
      windowsHide: true,
    });

    // Return the tmux session name as the "pane ID" for tracking
    return tmuxSession;
  } catch {
    return undefined;
  }
}

// ─── Terminal pane cleanup ───────────────────────────────────────────

/**
 * Kill a terminal pane by backend type and pane ID.
 */
function killTerminalPane(backend: string, paneId: string): void {
  try {
    if (backend === "wezterm") {
      execSync(`wezterm cli kill-pane --pane-id ${paneId}`, {
        encoding: "utf-8",
        windowsHide: true,
      });
    } else if (backend === "tmux") {
      execSync(`tmux kill-session -t ${paneId}`, {
        encoding: "utf-8",
        windowsHide: true,
      });
    }
  } catch {
    // Terminal pane may already be dead
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Determine if inline mode should wrap claude in a tmux session.
 *
 * Conditions:
 * - Windows: always false — WezTerm is the host terminal, tmux sessions
 *   inside it are unreliable (socket access, subprocess isolation issues).
 *   Use `-t wezterm` or `-t auto` for detached terminal mode instead.
 * - macOS/Linux + tmux available → yes
 * - Otherwise → no (plain spawnSync)
 */
async function shouldUseTmuxInline(): Promise<boolean> {
  // Skip tmux inline wrapping when running inside a bridge pane
  if (process.env.OMC_BRIDGE_PANE) {
    return false;
  }

  // On Windows, never use tmux inline — use WezTerm detached mode instead
  if (process.platform === "win32") {
    return false;
  }

  // Check if tmux binary exists (Unix only)
  try {
    execSync("tmux -V", { encoding: "utf-8", stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function formatAge(startedAt: number): string {
  const ms = Date.now() - startedAt;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}
