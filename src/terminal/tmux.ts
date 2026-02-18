import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BaseTerminalBackend, TerminalBackendError } from "./base";
import type { PaneId, PaneInfo, PaneCreateOptions } from "./types";

const TMUX_SESSION_NAME = "oh-my-claude-bridge";
const FIFO_PLACEHOLDER = "{{FIFO_PATH}}";

/**
 * tmux implementation of the terminal backend abstraction.
 *
 * When running inside an existing tmux session (TMUX env is set),
 * creates new windows within the current session so the user can see them.
 * When running outside tmux, creates a dedicated detached session.
 */
export class TmuxBackend extends BaseTerminalBackend {
  readonly name = "tmux" as const;

  private readonly sessionName: string;
  private readonly useCurrentSession: boolean;
  private readonly paneFifos = new Map<PaneId, string>();
  private fifoTempDir: string | null = null;

  constructor(options?: { sessionName?: string }) {
    super();
    this.useCurrentSession = !!process.env.TMUX;
    this.sessionName = this.useCurrentSession
      ? this.detectCurrentSession()
      : (options?.sessionName ?? TMUX_SESSION_NAME);
  }

  /**
   * Detect the current tmux session name.
   *
   * Uses `tmux list-sessions -F` with format string passed via stdin
   * to avoid shell/Bun stripping braces from `#{session_name}`.
   * Falls back to parsing $TMUX env (format: socket_path,pid,session_index).
   */
  private detectCurrentSession(): string {
    // Method 1: Use tmux display-message with -F format
    try {
      // Avoid #{} in args — MSYS/Bun strips braces. Use -F with format via pipe.
      const result = spawnSync("tmux", ["display-message", "-p", "#S"], {
        encoding: "utf-8",
        timeout: 5_000,
      });
      if (result.status === 0 && result.stdout?.trim()) {
        return result.stdout.trim();
      }
    } catch {
      // fall through
    }

    // Method 2: Parse TMUX env variable
    // Format: /tmp/tmux-1000/default,12345,0
    // The session index is the last number — use it to look up the session name
    try {
      const tmuxEnv = process.env.TMUX;
      if (tmuxEnv) {
        const result = spawnSync("tmux", ["list-sessions", "-F", "#S"], {
          encoding: "utf-8",
          timeout: 5_000,
        });
        if (result.status === 0 && result.stdout?.trim()) {
          // Return the first session (most likely current)
          const sessions = result.stdout.trim().split("\n");
          if (sessions[0]) return sessions[0].trim();
        }
      }
    } catch {
      // fall through
    }

    return TMUX_SESSION_NAME;
  }

  /**
   * Verify tmux availability, create session if needed, then create a new pane.
   *
   * If command contains {{FIFO_PATH}}, a per-pane FIFO is created and substituted.
   */
  async createPane(name: string, command: string, options?: PaneCreateOptions): Promise<PaneId> {
    await this.ensureTmuxInstalled();
    await this.ensureSession();

    let startupCommand = command;
    if (command.includes(FIFO_PLACEHOLDER)) {
      const fifoPath = await this.createFifoForPane(name);
      startupCommand = command.replaceAll(FIFO_PLACEHOLDER, fifoPath);
    }

    const paneId = await this.createSplitPane(startupCommand, options);

    await this.runCommand("tmux", ["select-pane", "-t", paneId, "-T", name]);

    this.registerPane({
      id: paneId,
      name,
      command: startupCommand,
      createdAt: new Date(),
    });

    if (startupCommand !== command) {
      const match = startupCommand.match(/([^\s"']*input_fifo[^\s"']*)/);
      if (match?.[1]) {
        this.paneFifos.set(paneId, match[1]);
      }
    }

    return paneId;
  }

  /**
   * Kill a tmux pane and clean associated metadata/resources.
   */
  async closePane(paneId: PaneId): Promise<void> {
    await this.ensureTmuxInstalled();
    await this.runCommand("tmux", ["kill-pane", "-t", paneId]);
    await this.cleanupPaneFifo(paneId);
    this.unregisterPane(paneId);
  }

  /**
   * List panes for the managed tmux session.
   */
  async listPanes(): Promise<PaneInfo[]> {
    await this.ensureTmuxInstalled();

    const hasSession = await this.sessionExists();
    if (!hasSession) {
      return [];
    }

    // Use short tmux format aliases (#D=pane_id, #T=pane_title) to avoid
    // brace stripping on MSYS/Bun (#{...} loses braces in some runtimes).
    // pane_start_command has no short alias — omit and use tracked data.
    const { stdout } = await this.runCommand("tmux", [
      "list-panes",
      "-t",
      this.sessionName,
      "-F",
      "#D\t#T",
    ]);

    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [id = "", paneTitle = ""] = line.split("\t");
        const tracked = this.getTrackedPane(id);
        return {
          id,
          name: tracked?.name ?? paneTitle,
          command: tracked?.command ?? "",
          createdAt: tracked?.createdAt ?? new Date(0),
        };
      });
  }

  /**
   * Inject text via FIFO when available, otherwise through tmux send-keys.
   *
   * For multi-line text, uses tmux load-buffer + paste-buffer to paste as a
   * single block. TUI apps (Codex, OpenCode) receive it as bracketed paste,
   * preventing each line from being submitted as a separate command.
   */
  async injectText(paneId: PaneId, text: string): Promise<void> {
    const fifoPath = this.paneFifos.get(paneId);
    if (fifoPath) {
      await appendFile(fifoPath, text, "utf8");
      return;
    }

    await this.ensureTmuxInstalled();

    const normalized = text.replace(/\r\n/g, "\n");

    // Multi-line: use tmux buffer paste (single block, no per-line Enter)
    if (normalized.includes("\n")) {
      // Strip trailing newline — we'll send Enter separately after paste
      const textToBuffer = normalized.replace(/\n+$/, "");
      const { spawnSync } = await import("node:child_process");
      // Load text into tmux buffer via stdin
      const result = spawnSync("tmux", ["load-buffer", "-"], {
        input: textToBuffer,
        encoding: "utf-8",
        timeout: 5000,
      });
      if (result.status === 0) {
        // Paste buffer into target pane and delete buffer (-d)
        await this.runCommand("tmux", ["paste-buffer", "-d", "-t", paneId]);
        return;
      }
      // Fallback to send-keys if load-buffer fails
    }

    // Single-line: use send-keys -l (literal text, no newline interpretation)
    const singleLine = normalized.replace(/\n+$/, "");
    if (singleLine.length > 0) {
      await this.runCommand("tmux", ["send-keys", "-t", paneId, "-l", singleLine]);
    }
  }

  /**
   * Send raw key sequences to a pane.
   */
  async sendKeys(paneId: PaneId, keys: string): Promise<void> {
    await this.ensureTmuxInstalled();
    const keyArgs = keys.split(/\s+/).filter((item) => item.length > 0);
    await this.runCommand("tmux", ["send-keys", "-t", paneId, ...keyArgs]);
  }

  /**
   * Determine whether a tmux pane still exists.
   */
  async isPaneAlive(paneId: PaneId): Promise<boolean> {
    await this.ensureTmuxInstalled();
    try {
      await this.runCommand("tmux", ["display-message", "-p", "-t", paneId, "#D"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Capture last N lines from pane scrollback.
   */
  async getPaneOutput(paneId: PaneId, lines: number): Promise<string> {
    await this.ensureTmuxInstalled();
    const safeLines = Number.isFinite(lines) ? Math.max(1, Math.floor(lines)) : 50;
    const { stdout } = await this.runCommand("tmux", [
      "capture-pane",
      "-p",
      "-t",
      paneId,
      "-S",
      `-${safeLines}`,
    ]);
    return stdout;
  }

  /**
   * Release backend resources (temporary FIFO directory).
   */
  async dispose(): Promise<void> {
    const tempDir = this.fifoTempDir;
    this.fifoTempDir = null;
    this.paneFifos.clear();

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Create a pane using the appropriate tmux command.
   *
   * Layout modes:
   * 1. split "h" — horizontal split (left/right), optionally targeting a pane
   * 2. split "v" — vertical split (top/bottom), optionally targeting a pane
   * 3. no split + current session — new window (full tab)
   * 4. no split + detached session — split-window (default)
   */
  private async createSplitPane(command: string, options?: PaneCreateOptions): Promise<PaneId> {
    // Use #D (short for pane_id) to avoid brace stripping on MSYS/Bun
    const formatArgs = ["-P", "-F", "#D"];
    const cwdArgs = options?.cwd ? ["-c", options.cwd] : [];
    let args: string[];

    if (options?.split) {
      // Explicit split direction requested
      const splitFlag = options.split === "h" ? "-h" : "-v";
      const target = options.targetPane ?? this.sessionName;
      const percentArgs = options.splitPercent
        ? ["-p", String(options.splitPercent)]
        : [];
      args = ["split-window", splitFlag, "-t", target, ...percentArgs, ...cwdArgs, ...formatArgs, command];
    } else if (this.useCurrentSession) {
      // Default for current session: new window (full-size tab)
      // -d = don't switch focus to the new window (avoids screen flicker)
      args = ["new-window", "-d", "-t", this.sessionName, ...cwdArgs, ...formatArgs, command];
    } else {
      // Default for detached session: split-window
      args = ["split-window", "-t", this.sessionName, ...cwdArgs, ...formatArgs, command];
    }

    const { stdout } = await this.runCommand("tmux", args);

    const paneId = stdout.trim();
    if (!paneId) {
      throw new TerminalBackendError({
        message: `tmux pane creation returned an empty pane id`,
        command: "tmux",
        args,
      });
    }

    return paneId;
  }

  private async ensureTmuxInstalled(): Promise<void> {
    const available = await this.commandExists("tmux", ["-V"]);
    if (!available) {
      throw new TerminalBackendError({
        message:
          "tmux is not installed or not available in PATH. Install tmux and ensure it is accessible from this process.",
        command: "tmux",
        args: ["-V"],
      });
    }
  }

  private async ensureSession(): Promise<void> {
    // When using the current tmux session, it already exists
    if (this.useCurrentSession) {
      return;
    }

    const hasSession = await this.sessionExists();
    if (hasSession) {
      return;
    }

    await this.runCommand("tmux", ["new-session", "-d", "-s", this.sessionName, "-n", "bridge"]);
  }

  private async sessionExists(): Promise<boolean> {
    try {
      await this.runCommand("tmux", ["has-session", "-t", this.sessionName]);
      return true;
    } catch {
      return false;
    }
  }

  private async createFifoForPane(name: string): Promise<string> {
    if (process.platform === "win32") {
      throw new TerminalBackendError({
        message:
          "FIFO-backed tmux panes are not supported on native Windows. Run inside WSL or remove {{FIFO_PATH}} from the command.",
        command: "mkfifo",
        args: [],
      });
    }

    if (!this.fifoTempDir) {
      this.fifoTempDir = await mkdtemp(join(tmpdir(), "oh-my-claude-bridge-"));
    }

    const fileName = `${name.replace(/[^a-zA-Z0-9_-]/g, "_")}-input_fifo`;
    const fifoPath = join(this.fifoTempDir, fileName);
    await this.runCommand("mkfifo", [fifoPath]);
    return fifoPath;
  }

  private async cleanupPaneFifo(paneId: PaneId): Promise<void> {
    const fifoPath = this.paneFifos.get(paneId);
    this.paneFifos.delete(paneId);

    if (!fifoPath) {
      return;
    }

    await rm(fifoPath, { force: true });
  }
}
