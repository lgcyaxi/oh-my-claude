import type { Command } from "commander";
import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createFormatters } from "../utils/colors";
import { INSTALL_DIR } from "../utils/paths";
import {
  readBridgeState,
  addAIToState,
  removeAIFromState,
  clearBridgeState,
  getStateFilePath,
  type AIEntry,
} from "../../bridge/state";
import { getBridgeOrchestrator } from "../../index";
import type { AIConfig } from "../../daemon/types";

const KNOWN_AI_NAMES = ["codex", "opencode", "gemini", "cc"] as const;

const DEFAULT_AI_CONFIGS: Record<string, Omit<AIConfig, "name">> = {
  codex: {
    cliCommand: "codex",
    cliArgs: [],
    idleTimeoutMs: 60000,
    requestTimeoutMs: 300000,
    maxRetries: 3,
  },
  opencode: {
    cliCommand: "opencode",
    cliArgs: [],
    idleTimeoutMs: 60000,
    requestTimeoutMs: 300000,
    maxRetries: 3,
  },
  gemini: {
    cliCommand: "gemini",
    cliArgs: [],
    idleTimeoutMs: 60000,
    requestTimeoutMs: 300000,
    maxRetries: 3,
  },
  cc: {
    cliCommand: "oh-my-claude",
    cliArgs: ["cc", "-t", "none"],
    idleTimeoutMs: 120000,
    requestTimeoutMs: 600000,
    maxRetries: 1,
  },
};

/**
 * Extract the base AI type from a potentially suffixed name.
 * E.g., "cc:2" → "cc", "cc:worker1" → "cc", "codex" → "codex"
 */
function getBaseAIName(name: string): string {
  const colonIdx = name.indexOf(":");
  return colonIdx > 0 ? name.slice(0, colonIdx) : name;
}

function createAIConfig(name: string, overrides?: Partial<AIConfig>): AIConfig {
  const baseName = getBaseAIName(name);
  const defaults = DEFAULT_AI_CONFIGS[baseName];
  if (!defaults) {
    throw new Error(`Unknown AI: ${name}. Supported: ${Object.keys(DEFAULT_AI_CONFIGS).join(", ")}`);
  }

  return {
    name,
    ...defaults,
    ...overrides,
  };
}
type KnownAIName = (typeof KNOWN_AI_NAMES)[number];

type DaemonLike = {
  getPaneId?: () => string | null;
  getProjectPath?: () => string | null;
};

type BridgeLike = {
  registerAI: (config: AIConfig) => Promise<DaemonLike>;
  unregisterAI: (name: string) => Promise<void>;
  listAIs?: () => Array<Record<string, unknown>>;
  ping: (name: string) => Promise<unknown>;
  getSystemStatus: () => Record<string, unknown>;
};

export function registerBridgeCommand(program: Command) {
  const bridgeCmd = program
    .command("bridge")
    .description("Manage Multi-AI Bridge assistants")
    .action(() => {
      printBridgeUsage();
    });

  bridgeCmd
    .command("up [ais...]")
    .description("Start AI assistant(s): codex, opencode, gemini, cc, or all")
    .option("--detached", "Open in separate window instead of right pane")
    .option("--session <name>", "Use named session")
    .option("--model <name>", "Specify model override")
    .option("--switch <alias>", "Auto-switch CC worker to a model after startup (e.g., ds, zp, mm)")
    .action(async (ais: string[], options: { detached?: boolean; session?: string; model?: string; switch?: string }) => {
      const { fail, warn, ok, dimText } = createFormatters();

      try {
        const bridge = await loadBridge();
        const names = parseAINames(ais);
        const state = readBridgeState();
        const alreadyRunning = new Set(state.ais.map((ai) => ai.name));
        const backend = detectTerminalBackend();

        // Default: pane-right layout (alongside Claude Code)
        // Use --detached to open in a separate window instead
        const paneRight = !options.detached;
        let firstRightPaneId: string | null = null;

        // Get current CC pane for split layout
        let ccPaneId: string | null = null;
        if (paneRight) {
          if (backend === "tmux") {
            ccPaneId = getCurrentTmuxPaneId();
          } else if (backend === "wezterm") {
            // Use $WEZTERM_PANE if we're inside WezTerm, otherwise pane 0
            ccPaneId = process.env.WEZTERM_PANE ?? "0";
          }
        }

        if (paneRight && backend === "tmux" && ccPaneId) {
          const currentWindow = getCurrentTmuxWindowPanes();
          const existingAI = state.ais.find(
            (ai) => ai.paneId && ai.terminalBackend === "tmux" && currentWindow.has(ai.paneId),
          );
          if (existingAI?.paneId) {
            firstRightPaneId = existingAI.paneId;
          }
        }

        if (paneRight && backend === "wezterm" && ccPaneId) {
          // Check if there's already an AI pane in this window
          const existingAI = state.ais.find(
            (ai) => ai.paneId && ai.terminalBackend === "wezterm",
          );
          if (existingAI?.paneId) {
            firstRightPaneId = existingAI.paneId;
          }
        }

        for (const name of names) {
          if (alreadyRunning.has(name)) {
            console.log(warn(`${name} is already running`));
            continue;
          }

          console.log(dimText(`Starting ${name}...`));

          try {
            const aiConfig = createAIConfig(name);

            // For WezTerm pane-right layout: override daemon's createPane via split options
            if (paneRight && backend === "wezterm" && ccPaneId) {
              const splitTarget = firstRightPaneId ?? ccPaneId;
              const splitDir = firstRightPaneId ? "v" : "h"; // first: right, subsequent: below
              aiConfig.paneCreateOptions = {
                split: splitDir as "h" | "v",
                targetPane: splitTarget,
                splitPercent: firstRightPaneId ? undefined : 50,
                cwd: process.cwd(),
              };
            }

            const daemon = await bridge.registerAI(aiConfig);

            // Extract paneId and projectPath from the daemon
            let paneId = daemon.getPaneId?.() ?? undefined;
            const projectPath = daemon.getProjectPath?.() ?? process.cwd();

            // --pane-right: rearrange into split layout (tmux only)
            if (paneRight && paneId && backend === "tmux" && ccPaneId) {
              paneId = rearrangeTmuxPane(paneId, firstRightPaneId, ccPaneId, dimText);
              if (!firstRightPaneId) {
                firstRightPaneId = paneId;
              }
            }

            // Track first WezTerm right pane
            if (paneRight && paneId && backend === "wezterm" && !firstRightPaneId) {
              firstRightPaneId = paneId;
            }

            // Persist to state file with terminal backend info
            addAIToState({
              name,
              cliCommand: aiConfig.cliCommand,
              startedAt: new Date().toISOString(),
              paneId,
              terminalBackend: backend,
              projectPath,
            });

            const paneInfo = paneId ? ` (pane: ${paneId})` : "";
            console.log(ok(`Started ${name}${paneInfo}`));

            // Auto-switch CC worker to a model if --switch is specified
            if (options.switch && getBaseAIName(name) === "cc" && paneId) {
              const switchDelay = 5000; // Wait for CC to initialize proxy + claude
              console.log(dimText(`  Waiting ${switchDelay / 1000}s for CC to initialize before switching...`));
              await new Promise((resolve) => setTimeout(resolve, switchDelay));
              const switchCmd = `/omc-switch ${options.switch}`;
              if (backend === "tmux") {
                sendToTmuxPane(paneId, switchCmd);
              } else if (backend === "wezterm") {
                sendToWezTermPane(paneId, switchCmd);
              }
              console.log(ok(`  Sent model switch: ${switchCmd}`));
            }
          } catch (error) {
            console.log(fail(formatBridgeError(name, error)));
          }
        }
        // Exit explicitly — daemon idle timers keep the event loop alive
        process.exit(0);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(fail(message));
        process.exit(1);
      }
    });

  bridgeCmd
    .command("down [ais...]")
    .description("Stop AI assistant(s): codex, opencode, gemini, cc, or all")
    .action(async (ais: string[]) => {
      const { fail, warn, ok, dimText } = createFormatters();

      try {
        const names = parseAINames(ais);
        const state = readBridgeState();
        const registeredMap = new Map(state.ais.map((ai) => [ai.name, ai]));

        // If "all", stop everything
        const toStop =
          ais.length > 0 && ais[0]?.toLowerCase() === "all"
            ? state.ais.map((ai) => ai.name)
            : names;

        for (const name of toStop) {
          const entry = registeredMap.get(name);
          if (!entry) {
            console.log(warn(`${name} is not running`));
            continue;
          }

          console.log(dimText(`Stopping ${name}...`));

          // Kill terminal pane first if available
          if (entry.paneId) {
            if (entry.terminalBackend === "wezterm") {
              killWezTermPane(entry.paneId);
            } else if (entry.terminalBackend === "tmux") {
              killTmuxPane(entry.paneId);
            }
          }

          // Fall back to process matching
          killAIProcess(name);

          removeAIFromState(name);
          console.log(ok(`Stopped ${name}`));
        }

        // If no AIs left, clear state file
        const remaining = readBridgeState();
        if (remaining.ais.length === 0) {
          clearBridgeState();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(fail(message));
        process.exit(1);
      }
    });

  bridgeCmd
    .command("send <ai> <message>")
    .description("Send a message to a running AI assistant")
    .option("--timeout <ms>", "Response timeout in ms", "120000")
    .option("--no-wait", "Don't wait for response")
    .option("--no-auto-close", "Keep pane alive after receiving response (default: auto-close)")
    .action(async (ai: string, message: string, options: { timeout?: string; wait?: boolean; autoClose?: boolean }) => {
      const { fail, warn, ok, dimText } = createFormatters();

      try {
        const name = normalizeAIName(ai);
        const state = readBridgeState();
        const entry = state.ais.find((a) => a.name === name);

        if (!entry) {
          console.log(fail(`${name} is not running. Start it with: oh-my-claude bridge up ${name}`));
          process.exit(1);
        }

        if (!entry.paneId) {
          console.log(fail(`${name} has no pane ID. It may have been started with an older version. Try: bridge down ${name} && bridge up ${name}`));
          process.exit(1);
        }

        if (entry.terminalBackend !== "wezterm" && entry.terminalBackend !== "tmux") {
          console.log(fail(`bridge send requires WezTerm or tmux backend (got: ${entry.terminalBackend ?? "unknown"})`));
          process.exit(1);
        }

        // Send the message via the appropriate terminal backend
        console.log(dimText(`Sending to ${name} via ${entry.terminalBackend}...`));
        if (entry.terminalBackend === "tmux") {
          sendToTmuxPane(entry.paneId, message);
        } else {
          sendToWezTermPane(entry.paneId, message);
        }
        console.log(ok(`Message sent to ${name}`));

        // Optionally wait for response via storage adapter polling
        const shouldWait = options.wait !== false;
        if (!shouldWait) {
          return;
        }

        const baseName = getBaseAIName(name);
        if (baseName !== "codex" && baseName !== "opencode" && baseName !== "cc") {
          console.log(dimText(`Response polling not supported for ${name} yet`));
          return;
        }

        const timeoutMs = parseInt(options.timeout ?? "120000", 10) || 120000;
        const projectPath = entry.projectPath ?? process.cwd();

        console.log(dimText(`Waiting for response (timeout: ${Math.round(timeoutMs / 1000)}s)...`));

        let response: string | null = null;
        if (baseName === "cc") {
          // CC uses pane-output-only polling (no storage adapter)
          const { pollCCPaneResponse } = await import("../../bridge/poll-response");
          response = await pollCCPaneResponse(entry, message, timeoutMs);
        } else {
          // Create pane monitor for terminal-based fallback detection
          const { pollForBridgeResponse } = await import("../../bridge/poll-response");
          let paneMonitor: import("../../bridge/poll-response").PaneMonitorOptions | undefined;
          if (entry.paneId && entry.terminalBackend) {
            const { TmuxBackend } = await import("../../terminal/tmux");
            const { WezTermBackend } = await import("../../terminal/wezterm");
            const backend = entry.terminalBackend === "tmux" ? new TmuxBackend() : new WezTermBackend();
            paneMonitor = { paneId: entry.paneId, backend, sentMessage: message };
          }
          response = await pollForBridgeResponse(name as "codex" | "opencode", projectPath, timeoutMs, paneMonitor);
        }

        if (response) {
          console.log(`\n${response}`);
        } else {
          console.log(warn("No response received within timeout"));
        }

        // Auto-close pane after getting response (default: true)
        const shouldAutoClose = options.autoClose !== false;
        if (shouldAutoClose && response && entry.paneId) {
          try {
            if (entry.terminalBackend === "wezterm") {
              killWezTermPane(entry.paneId);
            } else if (entry.terminalBackend === "tmux") {
              killTmuxPane(entry.paneId);
            }
            removeAIFromState(name);
            console.log(dimText(`Auto-closed ${name} pane`));
          } catch {
            // Best-effort cleanup — pane may already be gone
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(fail(message));
        process.exit(1);
      }
    });

  bridgeCmd
    .command("status")
    .description("Show status for all bridge AI assistants")
    .action(async () => {
      const { fail, c, dimText } = createFormatters();

      try {
        const state = readBridgeState();
        printBridgeStatus(state.ais, c, dimText);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(fail(message));
        process.exit(1);
      }
    });

  bridgeCmd
    .command("ping <ai>")
    .description("Check health for one AI assistant")
    .action(async (ai: string) => {
      const { fail, ok, warn, dimText } = createFormatters();

      try {
        const name = normalizeAIName(ai);
        const state = readBridgeState();
        const entry = state.ais.find((a) => a.name === name);

        if (!entry) {
          console.log(warn(`${name} is not running`));
          process.exit(1);
        }

        // Check pane liveness via the appropriate terminal backend
        if (entry.paneId && (entry.terminalBackend === "wezterm" || entry.terminalBackend === "tmux")) {
          const alive = entry.terminalBackend === "tmux"
            ? isTmuxPaneAlive(entry.paneId)
            : isWezTermPaneAlive(entry.paneId);
          if (alive) {
            console.log(ok(`${name} pane ${entry.paneId} is alive (${entry.terminalBackend})`));
          } else {
            console.log(warn(`${name} pane ${entry.paneId} is no longer alive`));
            process.exit(1);
          }
          return;
        }

        // Fall back to orchestrator ping
        const bridge = await loadBridge();
        const startedAt = Date.now();
        const result = await bridge.ping(name);
        const elapsed = Date.now() - startedAt;
        const detail = typeof result === "object" ? JSON.stringify(result) : String(result);

        console.log(ok(`${name} is healthy (${elapsed}ms)`));
        if (detail && detail !== "[object Object]") {
          console.log(dimText(detail));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(fail(`Ping failed: ${message}`));
        process.exit(1);
      }
    });

  bridgeCmd
    .command("logs <ai>")
    .description("Show recent bridge log lines for an AI assistant")
    .option("-n, --lines <count>", "Number of lines to show", "50")
    .action(async (ai: string, options: { lines?: string }) => {
      const { fail, warn, dimText, c } = createFormatters();

      try {
        const name = normalizeAIName(ai);
        const lines = parsePositiveInt(options.lines, "--lines");
        const logPath = await findLatestLogFile(name);

        if (!logPath) {
          console.log(warn(`No logs found for ${name}`));
          console.log(dimText(`Expected logs under ${join(INSTALL_DIR, "run", name, "logs")}`));
          process.exit(1);
        }

        const content = await readFile(logPath, "utf8");
        const fileLines = content.split(/\r?\n/).filter((line) => line.length > 0);
        const tail = fileLines.slice(Math.max(0, fileLines.length - lines));

        console.log(`${c.bold}Logs: ${name}${c.reset} ${c.dim}(${logPath})${c.reset}`);
        if (tail.length === 0) {
          console.log(dimText("Log file is empty."));
          return;
        }

        for (const line of tail) {
          console.log(line);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(fail(message));
        process.exit(1);
      }
    });
}

function printBridgeUsage(): void {
  const { c, dimText } = createFormatters();

  console.log(`${c.bold}Bridge Commands${c.reset}\n`);
  console.log(`  oh-my-claude bridge up [codex|opencode|gemini|cc|all]   ${dimText("# Start AI assistant(s)")}`);
  console.log(`  oh-my-claude bridge down [codex|opencode|gemini|cc|all] ${dimText("# Stop AI assistant(s)")}`);
  console.log(`  oh-my-claude bridge send <ai> "<message>"              ${dimText("# Send message to AI")}`);
  console.log(`  oh-my-claude bridge status                               ${dimText("# Show all AI statuses")}`);
  console.log(`  oh-my-claude bridge ping <ai-name>                       ${dimText("# Check AI health")}`);
  console.log(`  oh-my-claude bridge logs <ai-name>                       ${dimText("# Show recent AI logs")}`);

  console.log(`\n${c.bold}Examples${c.reset}`);
  console.log(`  oh-my-claude bridge up codex                        ${dimText("# Opens alongside Claude Code (right pane)")}`);
  console.log(`  oh-my-claude bridge up cc                           ${dimText("# Spawn CC with own proxy session")}`);
  console.log(`  oh-my-claude bridge up cc --switch ds               ${dimText("# CC auto-switched to DeepSeek")}`);
  console.log(`  oh-my-claude bridge up cc cc:2 cc:3                 ${dimText("# Multiple independent CC instances")}`);
  console.log(`  oh-my-claude bridge up codex --detached             ${dimText("# Opens in separate window")}`);
  console.log(`  oh-my-claude bridge send cc "What is 2+2?"`);
  console.log(`  oh-my-claude bridge send codex "Fix the login bug" --no-wait`);
  console.log(`  oh-my-claude bridge down all`);
}

function parseAINames(rawNames: string[]): string[] {
  if (rawNames.length === 0) {
    return ["codex"];
  }

  const normalized = rawNames.map(normalizeAIName);
  if (normalized.includes("all")) {
    return [...KNOWN_AI_NAMES];
  }

  return Array.from(new Set(normalized));
}

/**
 * Normalize an AI name input. Supports suffixed multi-instance names like `cc:2`, `cc:worker1`.
 * The base name must be a known AI type.
 */
function normalizeAIName(input: string): string {
  const value = input.toLowerCase();
  if (value === "all") {
    return "all";
  }

  const baseName = getBaseAIName(value);

  if ((KNOWN_AI_NAMES as readonly string[]).includes(baseName)) {
    return value;
  }

  throw new Error(`Unknown AI name "${input}". Use one of: ${KNOWN_AI_NAMES.join(", ")}, all, or cc:N for multiple CC instances`);
}

function parsePositiveInt(value: string | undefined, flag: string): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

async function findLatestLogFile(aiName: string): Promise<string | null> {
  const logDir = join(INSTALL_DIR, "run", aiName, "logs");
  if (!existsSync(logDir)) {
    return null;
  }

  const entries = await readdir(logDir);
  if (entries.length === 0) {
    return null;
  }

  let latestPath: string | null = null;
  let latestTime = 0;

  for (const entry of entries) {
    const path = join(logDir, entry);
    const fileStat = await stat(path);
    if (!fileStat.isFile()) {
      continue;
    }

    const mtime = fileStat.mtimeMs;
    if (mtime > latestTime) {
      latestTime = mtime;
      latestPath = path;
    }
  }

  return latestPath;
}

async function loadBridge(): Promise<BridgeLike> {
  const instance = getBridgeOrchestrator();

  if (!isBridgeLike(instance)) {
    throw new Error("Bridge core export is invalid. Expected methods: registerAI, unregisterAI, ping, getSystemStatus.");
  }

  return instance;
}

function isBridgeLike(value: unknown): value is BridgeLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.registerAI === "function" &&
    typeof candidate.unregisterAI === "function" &&
    typeof candidate.ping === "function" &&
    typeof candidate.getSystemStatus === "function"
  );
}

/**
 * Detect the terminal backend in use.
 *
 * On Windows: always use WezTerm. WezTerm is the host terminal — tmux runs
 * inside it. The WezTerm CLI is reliably accessible from all subprocesses,
 * while tmux server sockets may not be reachable from MCP/daemon contexts.
 * On Unix: prefer tmux.
 */
function detectTerminalBackend(): AIEntry["terminalBackend"] {
  // On Windows, always use WezTerm (even inside tmux)
  if (process.platform === "win32") {
    return "wezterm";
  }

  // On Unix, prefer tmux
  return "tmux";
}

/**
 * Print bridge status from persisted state file.
 */
function printBridgeStatus(
  ais: AIEntry[],
  c: ReturnType<typeof createFormatters>["c"],
  dimText: ReturnType<typeof createFormatters>["dimText"],
): void {
  console.log(`${c.bold}Bridge Status${c.reset}\n`);

  if (ais.length === 0) {
    console.log("No AI assistants running.");
    console.log(dimText(`\nState file: ${getStateFilePath()}`));
    return;
  }

  const header = ["name", "command", "pane", "backend", "started"] as const;
  const widthName = Math.max(header[0].length, ...ais.map((ai) => ai.name.length));
  const widthCmd = Math.max(header[1].length, ...ais.map((ai) => ai.cliCommand.length));
  const widthPane = Math.max(header[2].length, ...ais.map((ai) => (ai.paneId ?? "-").length));
  const widthBackend = Math.max(header[3].length, ...ais.map((ai) => (ai.terminalBackend ?? "-").length));

  console.log(
    `${header[0].padEnd(widthName)}  ${header[1].padEnd(widthCmd)}  ${header[2].padEnd(widthPane)}  ${header[3].padEnd(widthBackend)}  ${header[4]}`
  );

  for (const ai of ais) {
    const started = formatRelativeTime(ai.startedAt);
    const pane = ai.paneId ?? "-";
    const backend = ai.terminalBackend ?? "-";
    console.log(
      `${ai.name.padEnd(widthName)}  ${ai.cliCommand.padEnd(widthCmd)}  ${pane.padEnd(widthPane)}  ${backend.padEnd(widthBackend)}  ${started}`
    );
  }

  console.log(dimText(`\nState file: ${getStateFilePath()}`));
}

function formatRelativeTime(isoString: string): string {
  try {
    const then = new Date(isoString).getTime();
    const now = Date.now();
    const diffMs = now - then;

    if (diffMs < 60_000) return "just now";
    if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)}h ago`;
    return `${Math.floor(diffMs / 86400_000)}d ago`;
  } catch {
    return isoString;
  }
}

/**
 * Send text to a WezTerm pane via `wezterm cli send-text`.
 * Text is piped through stdin to avoid shell escaping issues.
 *
 * For TUI apps (Codex, OpenCode), we send the text first, then a raw CR (\x0d)
 * separately to trigger the Enter/Submit action. TUI frameworks treat \n in
 * pasted text as multi-line input, not as a submit action.
 */
function sendToWezTermPane(paneId: string, text: string): void {
  // Step 1: Send the text content (strip trailing newlines)
  const cleanText = text.replace(/[\r\n]+$/u, "");
  const textResult = spawnSync("wezterm", ["cli", "send-text", "--pane-id", paneId, "--no-paste"], {
    input: cleanText,
    timeout: 10_000,
  });

  if (textResult.error) {
    throw new Error(`Failed to send text to WezTerm pane ${paneId}: ${textResult.error.message}`);
  }
  if (textResult.status !== 0) {
    throw new Error(`wezterm cli send-text exited with code ${textResult.status}`);
  }

  // Step 2: Send raw CR to trigger Enter/Submit in TUI
  const enterResult = spawnSync("wezterm", ["cli", "send-text", "--pane-id", paneId, "--no-paste"], {
    input: "\x0d",
    timeout: 10_000,
  });

  if (enterResult.error) {
    throw new Error(`Failed to send Enter to WezTerm pane ${paneId}: ${enterResult.error.message}`);
  }
}

/**
 * Kill a WezTerm pane by its ID.
 */
function killWezTermPane(paneId: string): void {
  try {
    spawnSync("wezterm", ["cli", "kill-pane", "--pane-id", paneId], {
      stdio: "ignore",
      timeout: 10_000,
    });
  } catch {
    // Pane may already be dead
  }
}

/**
 * Check if a WezTerm pane is alive.
 */
function isWezTermPaneAlive(paneId: string): boolean {
  try {
    const result = spawnSync("wezterm", ["cli", "list", "--format", "json"], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    if (result.status !== 0 || !result.stdout) {
      return false;
    }
    const items = JSON.parse(result.stdout) as Array<{ pane_id?: number }>;
    const numericId = parseInt(paneId, 10);
    return items.some((item) => item.pane_id === numericId);
  } catch {
    return false;
  }
}

/**
 * Get the current tmux pane ID (the CC pane).
 */
function getCurrentTmuxPaneId(): string | null {
  try {
    const result = spawnSync("tmux", ["display-message", "-p", "#D"], {
      encoding: "utf-8",
      timeout: 5_000,
    });
    return result.status === 0 ? result.stdout?.trim() || null : null;
  } catch {
    return null;
  }
}

/**
 * Get the set of pane IDs in the current tmux window.
 */
function getCurrentTmuxWindowPanes(): Set<string> {
  try {
    const result = spawnSync("tmux", ["list-panes", "-F", "#{pane_id}"], {
      encoding: "utf-8",
      timeout: 5_000,
    });
    if (result.status !== 0) {
      return new Set();
    }
    return new Set(
      (result.stdout ?? "").split("\n").map((l) => l.trim()).filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

/**
 * Rearrange a tmux pane from its new-window into a split layout.
 *
 * When --pane-right is used:
 * - First AI: `join-pane -h -s <ai-pane> -t <cc-pane>` moves it to the right
 * - Subsequent AIs: `join-pane -v -s <ai-pane> -t <first-ai-pane>` stacks below
 *
 * Layout result:
 * ┌─────────┬──────────┐
 * │         │  codex   │
 * │   CC    ├──────────┤
 * │         │ opencode │
 * └─────────┴──────────┘
 *
 * Returns the pane ID (unchanged after join-pane).
 */
function rearrangeTmuxPane(
  paneId: string,
  firstRightPaneId: string | null,
  ccPaneId: string,
  dimText: (s: string) => string,
): string {
  try {
    if (!firstRightPaneId) {
      // First AI: move from its new window to the right of the CC pane
      // -d = don't switch focus, -h = horizontal split (left/right)
      // -s = source pane (the AI), -t = target pane (CC)
      const result = spawnSync("tmux", [
        "join-pane", "-d", "-h", "-s", paneId, "-t", ccPaneId, "-l", "50%",
      ], {
        encoding: "utf-8",
        timeout: 10_000,
      });
      if (result.status !== 0) {
        const stderr = result.stderr?.trim() ?? "";
        console.log(dimText(`  Layout: join-pane -h failed (${stderr}), keeping as separate window`));
        return paneId;
      }
    } else {
      // Subsequent AI: stack below the first right pane
      // -d = don't switch focus, -v = vertical split (top/bottom)
      const result = spawnSync("tmux", [
        "join-pane", "-d", "-v", "-s", paneId, "-t", firstRightPaneId,
      ], {
        encoding: "utf-8",
        timeout: 10_000,
      });
      if (result.status !== 0) {
        const stderr = result.stderr?.trim() ?? "";
        console.log(dimText(`  Layout: join-pane -v failed (${stderr}), keeping as separate window`));
        return paneId;
      }
    }

    // Ensure focus stays on the CC pane
    spawnSync("tmux", ["select-pane", "-t", ccPaneId], {
      timeout: 5_000,
    });
    return paneId;
  } catch {
    // Layout rearrangement is best-effort
    return paneId;
  }
}

/**
 * Send text to a tmux pane via `tmux send-keys`.
 *
 * For TUI apps (Codex, OpenCode), we send the text literally, then
 * a separate Enter key to trigger the submit action.
 */
function sendToTmuxPane(paneId: string, text: string): void {
  const cleanText = text.replace(/[\r\n]+$/u, "");

  // Multi-line: use tmux buffer paste (single block, no per-line Enter)
  if (cleanText.includes("\n")) {
    const bufResult = spawnSync("tmux", ["load-buffer", "-"], {
      input: cleanText,
      encoding: "utf-8",
      timeout: 5000,
    });
    if (bufResult.status === 0) {
      const pasteResult = spawnSync("tmux", ["paste-buffer", "-d", "-t", paneId], {
        timeout: 10_000,
      });
      if (pasteResult.status !== 0) {
        const stderr = pasteResult.stderr?.toString() ?? "";
        throw new Error(`tmux paste-buffer failed: ${stderr}`);
      }
    } else {
      // Fallback: send-keys -l (embedded newlines visible to TUI)
      const textResult = spawnSync("tmux", ["send-keys", "-t", paneId, "-l", cleanText], {
        timeout: 10_000,
      });
      if (textResult.status !== 0) {
        const stderr = textResult.stderr?.toString() ?? "";
        throw new Error(`tmux send-keys exited with code ${textResult.status}: ${stderr}`);
      }
    }
  } else {
    // Single-line: use send-keys -l (literal text)
    const textResult = spawnSync("tmux", ["send-keys", "-t", paneId, "-l", cleanText], {
      timeout: 10_000,
    });
    if (textResult.error) {
      throw new Error(`Failed to send text to tmux pane ${paneId}: ${textResult.error.message}`);
    }
    if (textResult.status !== 0) {
      const stderr = textResult.stderr?.toString() ?? "";
      throw new Error(`tmux send-keys exited with code ${textResult.status}: ${stderr}`);
    }
  }

  // Brief delay so TUI apps process pasted text before receiving Enter
  spawnSync("sleep", ["0.05"], { timeout: 5_000 });

  // Send Enter key to trigger submit
  const enterResult = spawnSync("tmux", ["send-keys", "-t", paneId, "Enter"], {
    timeout: 10_000,
  });

  if (enterResult.error) {
    throw new Error(`Failed to send Enter to tmux pane ${paneId}: ${enterResult.error.message}`);
  }
}

/**
 * Kill a tmux pane by its ID.
 */
function killTmuxPane(paneId: string): void {
  try {
    spawnSync("tmux", ["kill-pane", "-t", paneId], {
      stdio: "ignore",
      timeout: 10_000,
    });
  } catch {
    // Pane may already be dead
  }
}

/**
 * Check if a tmux pane is alive.
 */
function isTmuxPaneAlive(paneId: string): boolean {
  try {
    const result = spawnSync("tmux", ["display-message", "-p", "-t", paneId, "#D"], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    return result.status === 0 && !!result.stdout?.trim();
  } catch {
    return false;
  }
}

/**
 * Kill CLI processes for a bridge AI and close its terminal tab/window.
 *
 * On Windows the terminal backend (WezTerm or WT) spawns:
 *   cmd.exe /k <cliCommand>
 * as a detached process.  `bridge down` runs in a separate CLI invocation so the
 * in-memory orchestrator has no knowledge of those processes.  We use PowerShell's
 * `Get-CimInstance` (via EncodedCommand to avoid bash `$_` escaping) to find and
 * kill cmd.exe instances whose CommandLine contains the CLI name.
 *
 * On Unix: pkill by CLI command name.
 */
function killAIProcess(aiName: string): void {
  const baseName = getBaseAIName(aiName);
  const config = DEFAULT_AI_CONFIGS[baseName];
  if (!config) {
    return;
  }

  const cliCommand = config.cliCommand;

  try {
    if (process.platform === "win32") {
      const myPid = process.pid;
      // PowerShell script: find cmd.exe processes whose CommandLine matches
      // the AI CLI command, exclude our own PID, and kill them.
      const script = [
        `Get-CimInstance Win32_Process -Filter "name='cmd.exe'" |`,
        `  Where-Object { $_.ProcessId -ne ${myPid} -and $_.CommandLine -match '${cliCommand}' } |`,
        `  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ].join(" ");

      // Encode as UTF-16LE base64 to bypass bash escaping issues.
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      execSync(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
        stdio: "ignore",
        timeout: 10_000,
      });
    } else {
      execSync(`pkill -f "\\b${cliCommand}\\b" 2>/dev/null || true`, {
        stdio: "ignore",
        timeout: 5_000,
      });
    }
  } catch {
    // Best-effort — process may already be dead
  }
}

function formatBridgeError(aiName: string, error: unknown): string {
  let raw = error instanceof Error ? error.message : String(error);
  // Include stderr from TerminalBackendError for better diagnostics
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = (error as { stderr: string }).stderr;
    if (stderr) {
      raw += ` [stderr: ${stderr.trim()}]`;
    }
  }
  const normalized = raw.toLowerCase();

  const baseName = getBaseAIName(aiName);
  if (normalized.includes("cli_not_found") || normalized.includes("not found")) {
    if (baseName === "codex") {
      return "Codex CLI not found. Install it with: npm install -g @openai/codex";
    }
    if (baseName === "opencode") {
      return "OpenCode CLI not found. Install with: npm install -g opencode-ai";
    }
    if (baseName === "gemini") {
      return "Gemini CLI not found. Install Gemini CLI and ensure it is on your PATH.";
    }
    if (baseName === "cc") {
      return "oh-my-claude CLI not found. Install with: npm install -g @lgcyaxi/oh-my-claude";
    }
  }

  if (normalized.includes("already") && normalized.includes("running")) {
    return `${aiName} is already running`;
  }

  return `Failed to start ${aiName}: ${raw}`;
}
