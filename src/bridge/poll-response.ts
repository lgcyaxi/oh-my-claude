import { CodexStorageAdapter } from "../storage/codex";
import { OpenCodeStorageAdapter } from "../storage/opencode";
import type { TerminalBackend } from "../terminal/base";

/**
 * Options for pane-output-based early exit detection.
 */
export interface PaneMonitorOptions {
  /** Pane ID in the terminal backend. */
  paneId: string;
  /** Terminal backend instance (tmux or wezterm). */
  backend: TerminalBackend;
  /** The original message sent, used to detect stuck input. */
  sentMessage: string;
}

/**
 * Patterns indicating the AI is actively processing.
 */
const PROCESSING_PATTERNS = /thinking|loading|processing|generating|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏|⠐|⠑|⣾|⣽|⣻|⢿|⡿|⣟|⣯|⣷|Inspecting|Explored|esc\s+(?:to\s+)?interrupt|[⬝■]{3,}/i;

/**
 * Patterns indicating the AI has finished and is waiting for new input.
 * Covers Codex (> prompt), OpenCode (❯ prompt), and generic shell prompts.
 */
const PROMPT_PATTERNS = /^[>❯›\$]\s*$/m;

/**
 * Codex-specific prompt: "› text" with "context left" on same screen means
 * codex is idle waiting for input. Matches "% context left" at end of visible output.
 */
const CODEX_IDLE_PATTERN = /\d+%\s+context left\s*$/;

/**
 * OpenCode-specific idle: TUI shows "tab agents  ctrl+p commands" hint at bottom
 * when waiting for input. This is the most reliable OpenCode idle indicator.
 */
const OPENCODE_IDLE_PATTERN = /tab\s+agents\s+ctrl\+p\s+commands/;

/**
 * Patterns indicating an error occurred.
 */
const ERROR_PATTERNS = /\b(error|fatal|exception|panic|refused|denied|failed)\b.*$/im;

/**
 * Poll a CLI tool's storage adapter for a new assistant response.
 *
 * Takes a snapshot of existing messages, then polls until a new assistant
 * message appears, a terminal signal indicates completion, or the timeout expires.
 */
export async function pollForBridgeResponse(
  aiName: "codex" | "opencode",
  projectPath: string,
  timeoutMs: number,
  paneMonitor?: PaneMonitorOptions,
): Promise<string | null> {
  const adapter = aiName === "codex"
    ? new CodexStorageAdapter()
    : new OpenCodeStorageAdapter();

  // For codex: sessionId is the session file stem (we use "latest" heuristic)
  // For opencode: sessionId is the project path
  const sessionId = aiName === "opencode" ? projectPath : await findLatestCodexSession();

  if (!sessionId) {
    return null;
  }

  // Snapshot current messages to detect new ones
  const baseline = await adapter.readSession(sessionId);
  const baselineIds = new Set(baseline.map((m) => m.id));
  const baselineCount = baseline.length;

  const pollIntervalMs = 500;
  const paneCheckInterval = 5; // Check pane output every 5 polls (2.5s)
  const startTime = Date.now();
  let pollCount = 0;
  let lastPaneState: "idle" | "processing" | "unknown" = "unknown";

  while (Date.now() - startTime < timeoutMs) {
    await sleep(pollIntervalMs);
    pollCount++;

    // Check storage for new assistant messages
    const current = await adapter.readSession(sessionId);
    const newAssistantMessages = current.filter(
      (m) => m.role === "assistant" && !baselineIds.has(m.id) && current.length > baselineCount
    );

    if (newAssistantMessages.length > 0) {
      const latest = newAssistantMessages[newAssistantMessages.length - 1];
      return latest?.content ?? null;
    }

    // Pane-output-based early exit detection
    if (paneMonitor && pollCount % paneCheckInterval === 0) {
      try {
        const paneState = await checkPaneState(paneMonitor, lastPaneState);
        lastPaneState = paneState.state;

        if (paneState.earlyExit) {
          // Terminal shows completion but storage has no new message.
          // Wait one more cycle for storage to catch up, then exit.
          await sleep(pollIntervalMs * 2);

          const finalCheck = await adapter.readSession(sessionId);
          const finalNew = finalCheck.filter(
            (m) => m.role === "assistant" && !baselineIds.has(m.id) && finalCheck.length > baselineCount
          );

          if (finalNew.length > 0) {
            const latest = finalNew[finalNew.length - 1];
            return latest?.content ?? null;
          }

          // If there's error info from the pane, return it
          if (paneState.errorInfo) {
            return `[Terminal error detected] ${paneState.errorInfo}`;
          }

          // If message was never submitted, return early
          if (paneState.reason === "stuck_input") {
            return null;
          }

          // Prompt reappeared but no storage message — try reading pane output as response
          if (paneState.reason === "prompt_returned") {
            const fallbackOutput = await paneMonitor.backend.getPaneOutput(paneMonitor.paneId, 50);
            if (fallbackOutput.trim()) {
              return `[From terminal output] ${extractResponseFromPaneOutput(fallbackOutput, paneMonitor.sentMessage)}`;
            }
          }

          return null;
        }
      } catch {
        // Pane monitoring is best-effort — continue polling
      }
    }
  }

  return null;
}

interface PaneStateResult {
  state: "idle" | "processing" | "unknown";
  earlyExit: boolean;
  reason?: "stuck_input" | "prompt_returned" | "error_detected";
  errorInfo?: string;
}

/**
 * Analyze pane output to determine AI state.
 */
async function checkPaneState(
  monitor: PaneMonitorOptions,
  previousState: "idle" | "processing" | "unknown",
): Promise<PaneStateResult> {
  const output = await monitor.backend.getPaneOutput(monitor.paneId, 30);
  const lastLines = output.trim().split("\n").slice(-10).join("\n");

  // Check for processing indicators
  if (PROCESSING_PATTERNS.test(lastLines)) {
    return { state: "processing", earlyExit: false };
  }

  // Check for error messages
  const errorMatch = lastLines.match(ERROR_PATTERNS);
  if (errorMatch) {
    // Only early exit on error if we were previously processing
    // (avoid false positives from error text in prompts)
    if (previousState === "processing") {
      return {
        state: "idle",
        earlyExit: true,
        reason: "error_detected",
        errorInfo: errorMatch[0].trim(),
      };
    }
  }

  // Check if prompt has returned (AI finished)
  // Match standard prompts (>, ❯, ›, $), Codex idle, or OpenCode idle
  const isGenericPrompt = PROMPT_PATTERNS.test(lastLines);
  const isAppSpecificIdle = CODEX_IDLE_PATTERN.test(lastLines) || OPENCODE_IDLE_PATTERN.test(lastLines);

  if (isGenericPrompt || isAppSpecificIdle) {
    // If we were processing and now see a prompt, the AI is done
    if (previousState === "processing") {
      return {
        state: "idle",
        earlyExit: true,
        reason: "prompt_returned",
      };
    }

    // Fast-response path: app-specific idle detected but we never saw "processing"
    // (processing window was too brief for the poll interval to catch).
    // First time seeing idle from unknown → mark as idle (no early exit yet).
    // Second consecutive idle → trigger early exit (avoids false positives).
    if (isAppSpecificIdle && previousState === "idle") {
      return {
        state: "idle",
        earlyExit: true,
        reason: "prompt_returned",
      };
    }

    if (isAppSpecificIdle && previousState === "unknown") {
      return { state: "idle", earlyExit: false };
    }
  }

  // Check if sent message is still stuck in input (never submitted)
  const sentSnippet = monitor.sentMessage.slice(0, 60).trim();
  if (sentSnippet.length > 10) {
    const veryLastLines = output.trim().split("\n").slice(-3).join("\n");
    if (veryLastLines.includes(sentSnippet) && !PROCESSING_PATTERNS.test(lastLines)) {
      // If we've been seeing the same stuck state for multiple checks, bail out
      if (previousState === "idle") {
        return {
          state: "idle",
          earlyExit: true,
          reason: "stuck_input",
        };
      }
      return { state: "idle", earlyExit: false };
    }
  }

  // Can't determine state definitively
  return { state: previousState === "processing" ? "processing" : "unknown", earlyExit: false };
}

/**
 * Extract the AI's response text from raw pane output, stripping the sent message
 * and prompt lines.
 */
/**
 * Lines that are terminal decoration / statusline / CC chrome — not response content.
 */
// CC idle animations: single decorative char + space + "Verbing…" (e.g., "✻ Canoodling…", "· Moonwalking…")
const CC_IDLE_ANIMATION = /^.\s+\w+ing…\s*$|^.\s+\w+ing\.\.\.\s*$/;
const CC_CHROME_PATTERNS = /^[─━═┄]+$|^omc\s*\[|^\s*🤖|^\s*⏺\s*$|^\[mem:|DS:|ZP:|MM:|KM:|AI:\d+req|context left|▐▛|▝▜|▘▘|^\s*⎿\s+Tip:|^Try\s+"/;
// OpenCode TUI chrome: box-drawing borders, agent status lines, idle/nav hints, sidebar text, build output
const OPENCODE_CHROME_PATTERNS = /^[┃╹╻┏┗┛┓┣┫╋│▀▄▔]+\s*$|^\s*[┃│]\s*$|tab\s+agents\s+ctrl\+p\s+commands|▣\s+\w+.*·\s+\w+|Atlas \(Plan Executor\)|^\s*╹[▀▔]+|OpenCode\s+\d+\.\d+|bun\s+(install|run)|Checked\s+\d+\s+install|•\s+\w+\s+Connected|config-context|▀{10,}/;

function extractResponseFromPaneOutput(output: string, sentMessage: string): string {
  const lines = output.trim().split("\n");
  const sentSnippet = sentMessage.slice(0, 40).trim();

  // Find where the sent message ends and the response begins
  let responseStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.includes(sentSnippet)) {
      responseStart = i + 1;
    }
  }

  // Take everything after the sent message, excluding:
  // - prompt lines (❯, >, $)
  // - CC chrome/statusline decorations
  // - empty lines
  const responseLines = lines.slice(responseStart).filter(
    (line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return false;
      if (PROMPT_PATTERNS.test(trimmed)) return false;
      if (CC_CHROME_PATTERNS.test(trimmed)) return false;
      if (CC_IDLE_ANIMATION.test(trimmed)) return false;
      if (OPENCODE_CHROME_PATTERNS.test(trimmed)) return false;
      return true;
    }
  );

  // Strip OpenCode TUI artifacts:
  // 1. Remove sidebar content (separated by 10+ consecutive spaces from main content)
  // 2. Strip box-drawing border prefixes (┃, │)
  const cleaned = responseLines.map((line) => {
    // Cut off sidebar: split at first run of 10+ spaces
    const sidebarCut = line.replace(/\s{10,}.*$/, "");
    // Strip left border prefix
    return sidebarCut.replace(/^\s*[┃│]\s?/, "");
  });

  return cleaned.join("\n").trim() || "(No response content captured from terminal)";
}

/**
 * Find the latest Codex session by recursively scanning the sessions directory.
 * Codex v0.101+ stores sessions in nested date dirs: ~/.codex/sessions/YYYY/MM/DD/*.jsonl
 * Returns the full path to the latest session file (used as sessionId).
 */
async function findLatestCodexSession(): Promise<string | null> {
  const { readdir, stat } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");

  const sessionsDir = join(homedir(), ".codex", "sessions");

  let latestFile: string | null = null;
  let latestTime = 0;

  async function walkDir(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const fileStat = await stat(fullPath);
        if (fileStat.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.endsWith(".jsonl") && fileStat.mtimeMs > latestTime) {
          latestTime = fileStat.mtimeMs;
          latestFile = fullPath;
        }
      } catch {
        continue;
      }
    }
  }

  await walkDir(sessionsDir);
  return latestFile;
}

/**
 * Poll a CC (Claude Code) pane for response via pane-output-only capture.
 * CC has no storage adapter, so we monitor tmux/wezterm scrollback for
 * the transition from processing to idle (prompt returns).
 */
export async function pollCCPaneResponse(
  entry: { paneId?: string; terminalBackend?: string },
  sentMessage: string,
  timeoutMs: number,
): Promise<string | null> {
  if (!entry.paneId || !entry.terminalBackend) {
    return null;
  }

  let backend: import("../terminal/base").TerminalBackend;
  if (entry.terminalBackend === "tmux") {
    const { TmuxBackend } = await import("../terminal/tmux");
    backend = new TmuxBackend();
  } else {
    const { WezTermBackend } = await import("../terminal/wezterm");
    backend = new WezTermBackend();
  }

  const pollIntervalMs = 1000;
  const startTime = Date.now();
  let previousState: "idle" | "processing" | "unknown" = "unknown";
  // Track consecutive idle polls with stable content to avoid premature extraction
  let stableCount = 0;
  let lastExtracted = "";

  while (Date.now() - startTime < timeoutMs) {
    await sleep(pollIntervalMs);

    try {
      // CC panes have multi-line statuslines and chrome that consume visible area.
      // Use 200 lines of scrollback to ensure we capture the response.
      const output = await backend.getPaneOutput(entry.paneId, 200);
      const lastLines = output.trim().split("\n").slice(-20).join("\n");

      // Check for processing indicators
      if (PROCESSING_PATTERNS.test(lastLines)) {
        previousState = "processing";
        stableCount = 0;
        lastExtracted = "";
        continue;
      }

      // Check if prompt has returned (CC finished)
      if (PROMPT_PATTERNS.test(lastLines)) {
        if (previousState === "processing") {
          // Normal path: saw processing, now idle → extract response
          // Still wait for stable output to avoid catching intermediate renders
          const extracted = extractResponseFromPaneOutput(output, sentMessage);
          if (extracted && !extracted.startsWith("(No response")) {
            if (extracted === lastExtracted) {
              stableCount++;
              if (stableCount >= 2) return extracted;
            } else {
              lastExtracted = extracted;
              stableCount = 1;
            }
            continue;
          }
          // Fallback: prompt returned after processing but no extractable content
          stableCount++;
          if (stableCount >= 3) return extracted;
          continue;
        }

        // Fast-response path: CC finished before we detected processing.
        const extracted = extractResponseFromPaneOutput(output, sentMessage);
        if (extracted && !extracted.startsWith("(No response")) {
          // Wait for content to stabilize across consecutive polls
          if (extracted === lastExtracted) {
            stableCount++;
            if (stableCount >= 2) return extracted;
          } else {
            lastExtracted = extracted;
            stableCount = 1;
          }
          continue;
        }
      }

      stableCount = 0;
      lastExtracted = "";
    } catch {
      // Pane may be temporarily unavailable
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
