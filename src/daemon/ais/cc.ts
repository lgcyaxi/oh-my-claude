import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { AIDaemon } from "../base";
import type { AIConfig } from "../types";
import type { PaneId, TerminalBackend } from "../../terminal";

/**
 * Patterns indicating the AI has finished and is waiting for new input.
 * Claude Code shows `❯` when ready. Also detect generic shell prompts.
 */
const CC_PROMPT_PATTERNS = /^[>❯›\$]\s*$/m;

/**
 * Patterns indicating the AI is actively processing.
 */
const CC_PROCESSING_PATTERNS = /thinking|loading|processing|generating|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏|⠐|⠑|\.{3,}|⣾|⣽|⣻|⢿|⡿|⣟|⣯|⣷|Inspecting|Explored|esc to interrupt/i;

export interface CCDaemonOptions {
  config: AIConfig;
  terminal: TerminalBackend;
  projectPath: string;
  runtimeDir?: string;
}

/**
 * Daemon that bridges requests to a Claude Code instance (`oh-my-claude cc`).
 *
 * Unlike Codex/OpenCode daemons, CC has no storage adapter — response capture
 * is pane-output-only (poll tmux/wezterm scrollback for prompt return, extract
 * response text between the injected message and the returning prompt).
 *
 * Each CC daemon spawns its own proxy session via `oh-my-claude cc -t none`,
 * enabling independent `switch_model` calls per instance.
 */
export class CCDaemon extends AIDaemon {
  readonly name: string;
  readonly config: AIConfig;

  private readonly terminal: TerminalBackend;
  private readonly projectPath: string;
  private readonly runtimeDir: string;

  private paneId: PaneId | null = null;
  private lastSentMessage = "";
  private previousState: "idle" | "processing" | "unknown" = "unknown";

  constructor(options: CCDaemonOptions) {
    super();
    this.name = options.config.name;
    this.config = options.config;
    this.terminal = options.terminal;
    this.projectPath = options.projectPath;
    this.runtimeDir = options.runtimeDir ?? join(homedir(), ".claude", "oh-my-claude", "run", options.config.name);
  }

  override getPaneId(): string | null {
    return this.paneId;
  }

  override getProjectPath(): string | null {
    return this.projectPath;
  }

  /**
   * Launch `oh-my-claude cc -t none` in a terminal pane.
   * The cc command handles proxy startup + claude launch internally.
   */
  async start(): Promise<void> {
    await this.verifyInstallation();
    await mkdir(this.runtimeDir, { recursive: true, mode: 0o700 });

    const command = this.buildStartupCommand();
    const paneOpts = this.config.paneCreateOptions ?? { cwd: this.projectPath };
    if (!paneOpts.cwd) paneOpts.cwd = this.projectPath;
    this.paneId = await this.terminal.createPane(this.name, command, paneOpts);
  }

  async stop(): Promise<void> {
    if (this.paneId) {
      await this.terminal.closePane(this.paneId);
      this.paneId = null;
    }
  }

  /**
   * Send a message by injecting text into the terminal pane + Enter.
   */
  async send(message: string): Promise<void> {
    if (!this.paneId) {
      throw new Error("CC pane is not available");
    }

    this.lastSentMessage = message;
    this.previousState = "unknown";

    const payload = message.replace(/\r\n/gu, "\n").replace(/[\r\n]+$/u, "");
    await this.terminal.injectText(this.paneId, payload);
  }

  /**
   * Poll pane output for response. Detects processing → idle transition,
   * then extracts response text between the sent message and the prompt.
   */
  async checkResponse(): Promise<string | null> {
    if (!this.paneId) {
      return null;
    }

    const output = await this.terminal.getPaneOutput(this.paneId, 50);
    const lastLines = output.trim().split("\n").slice(-15).join("\n");

    // Check for processing indicators
    if (CC_PROCESSING_PATTERNS.test(lastLines)) {
      this.previousState = "processing";
      return null;
    }

    // Check if prompt has returned (CC finished)
    if (CC_PROMPT_PATTERNS.test(lastLines)) {
      if (this.previousState === "processing") {
        this.previousState = "idle";
        // Extract response from pane output
        return this.extractResponse(output);
      }
    }

    return null;
  }

  /**
   * Extract the response text from pane output.
   * Finds content between the sent message and the returning prompt.
   */
  private extractResponse(output: string): string {
    const lines = output.trim().split("\n");
    const sentSnippet = this.lastSentMessage.slice(0, 40).trim();

    // Find where the sent message ends
    let responseStart = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.includes(sentSnippet)) {
        responseStart = i + 1;
      }
    }

    // Take everything after the sent message, excluding trailing prompt lines
    const responseLines = lines.slice(responseStart).filter(
      (line) => !CC_PROMPT_PATTERNS.test(line.trim()) && line.trim().length > 0,
    );

    return responseLines.join("\n").trim() || "(No response captured from CC terminal)";
  }

  private buildStartupCommand(): string {
    const args = [...(this.config.cliArgs ?? [])];
    const cmd = [this.config.cliCommand, ...args]
      .map((part) => this.shellQuote(part))
      .join(" ");
    // Set OMC_BRIDGE_PANE=1 to skip tmux inline wrapping inside the pane
    return `OMC_BRIDGE_PANE=1 ${cmd}`;
  }

  private shellQuote(value: string): string {
    if (!value) {
      return "''";
    }
    if (/^[A-Za-z0-9_./:\\-]+$/u.test(value)) {
      return value;
    }
    return `'${value.replace(/'/gu, "'\\''")}'`;
  }

  private async verifyInstallation(): Promise<void> {
    await this.runCommand(this.config.cliCommand, ["--version"], 8_000);
  }

  private runCommand(command: string, args: string[], timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "ignore", "pipe"],
        shell: process.platform === "win32",
        windowsHide: true,
      });

      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
      }, timeoutMs);

      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Command failed (${code ?? "unknown"}): ${command} ${args.join(" ")} ${stderr}`.trim()));
      });
    });
  }
}
