import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { AIDaemon } from "../base";
import type { AIConfig } from "../types";
import type { PaneId, TerminalBackend } from "../../terminal";
import { CodexStorageAdapter, getCodexSessionId, type Message, type Watcher } from "../../storage";
import { createIPCChannel, type IPCChannel } from "../../ipc";

interface CodexSessionState {
  bridgeSessionId: string;
  codexSessionId: string;
  projectPath: string;
  paneId?: string;
  startedAt?: string;
  updatedAt: string;
}

export interface CodexDaemonOptions {
  config: AIConfig;
  terminal: TerminalBackend;
  projectPath: string;
  runtimeDir?: string;
}

/**
 * Concrete daemon that bridges queued requests to the Codex CLI.
 *
 * The daemon starts Codex inside a managed terminal pane, writes queued input
 * through an IPC channel abstraction (Unix FIFO / Windows named pipe),
 * and reads assistant responses from Codex JSONL session logs through
 * `CodexStorageAdapter`.
 */
export class CodexDaemon extends AIDaemon {
  readonly name = "codex";
  readonly config: AIConfig;

  private readonly terminal: TerminalBackend;
  private readonly storage = new CodexStorageAdapter();
  private readonly projectPath: string;
  private readonly runtimeDir: string;
  private readonly sessionFilePath: string;
  private readonly logsDir: string;
  private readonly bridgeSessionId: string;

  private ipcChannel: IPCChannel | null = null;
  private useIPC = false;
  private paneId: PaneId | null = null;
  private watcher: Watcher | null = null;
  private codexSessionId: string;
  private lastResponseMessageId: string | null = null;
  private responseBuffer = "";
  private cachedMessages: Message[] = [];

  constructor(options: CodexDaemonOptions) {
    super();
    this.config = options.config;
    this.terminal = options.terminal;
    this.projectPath = options.projectPath;
    this.runtimeDir = options.runtimeDir ?? join(homedir(), ".claude", "oh-my-claude", "run", "codex");
    this.logsDir = join(this.runtimeDir, "logs");
    this.sessionFilePath = join(this.runtimeDir, "session.json");
    this.bridgeSessionId = this.hashProjectPath(this.projectPath);
    this.codexSessionId = this.bridgeSessionId;
  }

  override getPaneId(): string | null {
    return this.paneId;
  }

  override getProjectPath(): string | null {
    return this.projectPath;
  }

  /**
   * Start Codex runtime resources and launch Codex CLI in a terminal pane.
   */
  async start(): Promise<void> {
    await this.verifyCodexInstallation();
    await this.prepareRuntimeDirectory();

    const persisted = await this.loadSessionState();
    if (persisted?.codexSessionId) {
      this.codexSessionId = persisted.codexSessionId;
    }

    const command = this.buildStartupCommand();
    const paneOpts = this.config.paneCreateOptions ?? { cwd: this.projectPath };
    if (!paneOpts.cwd) paneOpts.cwd = this.projectPath;
    this.paneId = await this.terminal.createPane(this.name, command, paneOpts);
    await this.initializeIPCChannel();

    await this.tryResolveCodexSessionId();
    this.beginStorageWatch();
    await this.persistSessionState();
  }

  /**
   * Stop log watching, close pane, and clean up runtime input channels.
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.paneId) {
      await this.terminal.closePane(this.paneId);
      this.paneId = null;
    }

    await this.destroyIPCChannel();
    await this.persistSessionState();
  }

  /**
   * Send a single request message to Codex.
   * Tries IPC first, falls back to terminal injection.
   */
  async send(message: string): Promise<void> {
    const payload = `${message.replace(/\r\n/gu, "\n")}\n`;

    if (this.useIPC && this.ipcChannel) {
      try {
        await this.ipcChannel.write(payload);
        return;
      } catch (error) {
        console.warn("Codex IPC send failed, falling back to terminal injection:", error);
        await this.destroyIPCChannel();
      }
    }

    await this.sendViaTerminal(payload);
  }

  /**
   * Read Codex session messages and return the latest unseen assistant reply.
   */
  async checkResponse(): Promise<string | null> {
    if (this.cachedMessages.length === 0) {
      await this.refreshMessages();
    }

    const latestAssistant = [...this.cachedMessages]
      .reverse()
      .find((message) => message.role === "assistant" && message.content.trim().length > 0);

    if (!latestAssistant) {
      await this.tryResolveCodexSessionId();
      await this.refreshMessages();
      const fallbackAssistant = [...this.cachedMessages]
        .reverse()
        .find((message) => message.role === "assistant" && message.content.trim().length > 0);

      if (!fallbackAssistant) {
        return null;
      }

      if (
        this.lastResponseMessageId === fallbackAssistant.id
        || this.responseBuffer === fallbackAssistant.content
      ) {
        return null;
      }

      this.lastResponseMessageId = fallbackAssistant.id;
      this.responseBuffer = fallbackAssistant.content;
      return fallbackAssistant.content;
    }

    if (
      this.lastResponseMessageId === latestAssistant.id
      || this.responseBuffer === latestAssistant.content
    ) {
      return null;
    }

    this.lastResponseMessageId = latestAssistant.id;
    this.responseBuffer = latestAssistant.content;
    return latestAssistant.content;
  }

  private async verifyCodexInstallation(): Promise<void> {
    await this.runCommand(this.config.cliCommand, ["--version"], 8_000);
  }

  private async prepareRuntimeDirectory(): Promise<void> {
    await mkdir(this.runtimeDir, { recursive: true, mode: 0o700 });
    await mkdir(this.logsDir, { recursive: true, mode: 0o700 });
  }

  private async initializeIPCChannel(): Promise<void> {
    const channelName = process.platform === "win32"
      ? `codex-input-${this.bridgeSessionId}`
      : "input";

    try {
      const channel = createIPCChannel({
        name: channelName,
        runtimeDir: this.runtimeDir,
      });

      channel.onData((line) => {
        void this.sendViaTerminal(`${line}\n`);
      });

      channel.onError((error) => {
        if (!this.useIPC) {
          return;
        }

        console.warn("Codex IPC channel error, falling back to terminal injection:", error);
        this.useIPC = false;
      });

      await channel.create();
      this.ipcChannel = channel;
      this.useIPC = true;
    } catch (error) {
      this.ipcChannel = null;
      this.useIPC = false;
      console.warn("Codex IPC unavailable, using terminal injection:", error);
    }
  }

  private async destroyIPCChannel(): Promise<void> {
    const channel = this.ipcChannel;
    this.ipcChannel = null;
    this.useIPC = false;

    if (!channel) {
      return;
    }

    try {
      await channel.destroy();
    } catch (error) {
      console.warn("Failed to destroy Codex IPC channel:", error);
    }
  }

  private async sendViaTerminal(payload: string): Promise<void> {
    if (!this.paneId) {
      throw new Error("Codex pane is not available");
    }

    await this.terminal.injectText(this.paneId, payload);
  }

  private buildStartupCommand(): string {
    return this.buildCodexExecutionCommand();
  }

  private buildCodexExecutionCommand(): string {
    const args = [...(this.config.cliArgs ?? [])];
    // Codex doesn't support -p flag, just run it directly
    return [this.config.cliCommand, ...args]
      .map((part) => this.shellQuote(part))
      .join(" ");
  }

  private shellQuote(value: string): string {
    if (!value) {
      return "''";
    }

    if (/^[A-Za-z0-9_./:\\-]+$/u.test(value)) {
      return value;
    }

    return `'${this.escapeForSingleQuotedShell(value)}'`;
  }

  private escapeForSingleQuotedShell(value: string): string {
    return value.replace(/'/gu, "'\\''");
  }

  private beginStorageWatch(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    try {
      this.watcher = this.storage.watch(this.codexSessionId, (messages) => {
        this.cachedMessages = messages;
      });
    } catch {
      this.watcher = null;
    }
  }

  private async refreshMessages(): Promise<void> {
    this.cachedMessages = await this.storage.readSession(this.codexSessionId);
  }

  private async tryResolveCodexSessionId(): Promise<void> {
    try {
      const discovered = await getCodexSessionId(this.projectPath);
      if (discovered && discovered !== this.codexSessionId) {
        this.codexSessionId = discovered;
        this.cachedMessages = [];
        this.lastResponseMessageId = null;
        this.responseBuffer = "";
        this.beginStorageWatch();
        await this.persistSessionState();
      }
    } catch {
    }
  }

  private async loadSessionState(): Promise<CodexSessionState | null> {
    try {
      const raw = await readFile(this.sessionFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<CodexSessionState>;

      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      if (parsed.projectPath !== this.projectPath) {
        return null;
      }

      if (typeof parsed.bridgeSessionId !== "string" || typeof parsed.codexSessionId !== "string") {
        return null;
      }

      return {
        bridgeSessionId: parsed.bridgeSessionId,
        codexSessionId: parsed.codexSessionId,
        projectPath: parsed.projectPath,
        paneId: parsed.paneId,
        startedAt: parsed.startedAt,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  private async persistSessionState(): Promise<void> {
    const state: CodexSessionState = {
      bridgeSessionId: this.bridgeSessionId,
      codexSessionId: this.codexSessionId,
      projectPath: this.projectPath,
      paneId: this.paneId ?? undefined,
      updatedAt: new Date().toISOString(),
    };

    await writeFile(this.sessionFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  private hashProjectPath(projectPath: string): string {
    return createHash("sha256").update(projectPath).digest("hex").slice(0, 24);
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
