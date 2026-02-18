import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { AIDaemon } from "../base";
import type { AIConfig } from "../types";
import type { PaneId, TerminalBackend } from "../../terminal";
import { OpenCodeStorageAdapter, type Message, type Watcher } from "../../storage";
import { createIPCChannel, type IPCChannel } from "../../ipc";

interface OpenCodeSessionState {
  bridgeSessionId: string;
  projectId: string;
  projectPath: string;
  paneId?: string;
  updatedAt: string;
}

export interface OpenCodeDaemonOptions {
  config: AIConfig;
  terminal: TerminalBackend;
  projectPath: string;
  runtimeDir?: string;
}

export class OpenCodeDaemon extends AIDaemon {
  readonly name = "opencode";
  readonly config: AIConfig;

  private readonly terminal: TerminalBackend;
  private readonly storage = new OpenCodeStorageAdapter();
  private readonly projectPath: string;
  private readonly runtimeDir: string;
  private readonly sessionFilePath: string;
  private readonly bridgeSessionId: string;

  private paneId: PaneId | null = null;
  private watcher: Watcher | null = null;
  private ipcChannel: IPCChannel | null = null;
  private useIPC = false;
  private projectId = "";
  private lastResponseMessageId: string | null = null;
  private responseBuffer = "";
  private cachedMessages: Message[] = [];

  constructor(options: OpenCodeDaemonOptions) {
    super();
    this.config = options.config;
    this.terminal = options.terminal;
    this.projectPath = options.projectPath;
    this.runtimeDir = options.runtimeDir ?? join(homedir(), ".claude", "oh-my-claude", "run", "opencode");
    this.sessionFilePath = join(this.runtimeDir, "session.json");
    this.bridgeSessionId = this.hashProjectPath(this.projectPath);
  }

  override getPaneId(): string | null {
    return this.paneId;
  }

  override getProjectPath(): string | null {
    return this.projectPath;
  }

  async start(): Promise<void> {
    await this.verifyOpenCodeInstallation();
    await this.prepareRuntimeDirectory();

    const persisted = await this.loadSessionState();
    this.projectId = persisted?.projectId ?? await this.calculateProjectId();

    const command = this.buildStartupCommand();
    const paneOpts = this.config.paneCreateOptions ?? { cwd: this.projectPath };
    if (!paneOpts.cwd) paneOpts.cwd = this.projectPath;
    this.paneId = await this.terminal.createPane(this.name, command, paneOpts);
    await this.initializeIPCChannel();

    this.beginStorageWatch();
    await this.refreshMessages();
    await this.persistSessionState();
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    await this.destroyIPCChannel();

    if (this.paneId) {
      await this.terminal.closePane(this.paneId);
      this.paneId = null;
    }

    await this.persistSessionState();
  }

  async send(message: string): Promise<void> {
    const payload = `${message.replace(/\r\n/gu, "\n")}\n`;

    if (this.useIPC && this.ipcChannel) {
      try {
        await this.ipcChannel.write(payload);
        return;
      } catch (error) {
        console.warn("OpenCode IPC send failed, falling back to terminal injection:", error);
        await this.destroyIPCChannel();
      }
    }

    await this.sendViaTerminal(payload);
  }

  private async initializeIPCChannel(): Promise<void> {
    const channelName = `opencode-input-${this.bridgeSessionId}`;

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

        console.warn("OpenCode IPC channel error, falling back to terminal injection:", error);
        this.useIPC = false;
      });

      await channel.create();
      this.ipcChannel = channel;
      this.useIPC = true;
    } catch (error) {
      this.ipcChannel = null;
      this.useIPC = false;
      console.warn("OpenCode IPC unavailable, using terminal injection:", error);
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
      console.warn("Failed to destroy OpenCode IPC channel:", error);
    }
  }

  private async sendViaTerminal(payload: string): Promise<void> {
    if (!this.paneId) {
      throw new Error("OpenCode pane is not available");
    }

    await this.terminal.injectText(this.paneId, payload);
  }

  async checkResponse(): Promise<string | null> {
    if (this.cachedMessages.length === 0) {
      await this.refreshMessages();
    }

    const latestAssistant = [...this.cachedMessages]
      .reverse()
      .find((message) => message.role === "assistant" && message.content.trim().length > 0);

    if (!latestAssistant) {
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

  private async verifyOpenCodeInstallation(): Promise<void> {
    try {
      await this.runCommand(this.config.cliCommand, ["--version"], 8_000);
      return;
    } catch {
    }

    try {
      await this.runCommand(this.config.cliCommand, ["-v"], 8_000);
      return;
    } catch (error) {
      throw new Error(
        "OpenCode CLI is not available. OpenCode is archived; install with: npm install -g opencode-ai",
        { cause: error }
      );
    }
  }

  private async prepareRuntimeDirectory(): Promise<void> {
    await mkdir(this.runtimeDir, { recursive: true, mode: 0o700 });
  }

  private buildStartupCommand(): string {
    const args = [...(this.config.cliArgs ?? [])];

    // Do NOT pass -c/--context — that causes opencode to resume a previous
    // session instead of starting a fresh conversation.  Just launch in the
    // project directory (WezTerm's --cwd or cd /d handle the working dir).
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

    return `'${value.replace(/'/gu, "'\\''")}'`;
  }

  private beginStorageWatch(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.watcher = this.storage.watch(this.projectId, (messages) => {
      this.cachedMessages = messages;
    });
  }

  private async refreshMessages(): Promise<void> {
    this.cachedMessages = await this.storage.readSession(this.projectId);
  }

  private async calculateProjectId(): Promise<string> {
    // Use git repo root (stable across commits) instead of HEAD (changes on every commit)
    try {
      const repoRoot = await this.runCommand("git", ["rev-parse", "--show-toplevel"], 5_000, this.projectPath);
      const normalized = repoRoot.trim();
      if (normalized.length > 0) {
        return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
      }
    } catch {
    }

    return createHash("sha256").update(resolve(this.projectPath)).digest("hex").slice(0, 24);
  }

  private async loadSessionState(): Promise<OpenCodeSessionState | null> {
    try {
      const raw = await readFile(this.sessionFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<OpenCodeSessionState>;

      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      if (parsed.projectPath !== this.projectPath) {
        return null;
      }

      if (typeof parsed.bridgeSessionId !== "string" || typeof parsed.projectId !== "string") {
        return null;
      }

      return {
        bridgeSessionId: parsed.bridgeSessionId,
        projectId: parsed.projectId,
        projectPath: parsed.projectPath,
        paneId: parsed.paneId,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  private async persistSessionState(): Promise<void> {
    const state: OpenCodeSessionState = {
      bridgeSessionId: this.bridgeSessionId,
      projectId: this.projectId,
      projectPath: this.projectPath,
      paneId: this.paneId ?? undefined,
      updatedAt: new Date().toISOString(),
    };

    await writeFile(this.sessionFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  private hashProjectPath(projectPath: string): string {
    return createHash("sha256").update(projectPath).digest("hex").slice(0, 24);
  }

  private runCommand(command: string, args: string[], timeoutMs: number, cwd?: string): Promise<string> {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
        windowsHide: true,
        cwd,
      });

      let stdout = "";
      let stderr = "";

      const timeout = setTimeout(() => {
        child.kill();
        rejectPromise(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
      }, timeoutMs);

      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        rejectPromise(error);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolvePromise(stdout);
          return;
        }

        rejectPromise(
          new Error(`Command failed (${code ?? "unknown"}): ${command} ${args.join(" ")} ${stderr}`.trim())
        );
      });
    });
  }
}
