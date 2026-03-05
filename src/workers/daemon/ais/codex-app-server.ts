/**
 * CodexAppServerDaemon — headless daemon that communicates with `codex app-server`
 * over JSON-RPC 2.0 via stdin/stdout pipes.
 *
 * Replaces the terminal-pane + JSONL-polling approach of `CodexDaemon` with a
 * clean, event-driven transport. No tmux/wezterm, no IPC FIFO, no file watching.
 *
 * Wire protocol (verified empirically on codex-cli 0.107.0):
 *   1. initialize          → {userAgent}
 *   2. newConversation     → {conversationId, model, ...}
 *   3. addConversationListener → {subscriptionId}
 *   4. sendUserTurn        → {} (empty; response arrives via notifications)
 *
 * Notification methods (JSON-RPC notifications, no `id` field):
 *   codex/event/agent_message_delta  → streaming text chunk
 *   codex/event/agent_message        → full final message
 *   codex/event/task_complete        → turn done
 *   codex/event/error                → turn failed
 *
 * Auth: app-server reads credentials from ~/.codex/auth.json (same store as
 * codex CLI). Daemon calls getAuthStatus on start; if authMethod is null,
 * throws a clear error pointing to `omc auth openai`.
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

import { AIDaemon } from "../base";
import type { AIConfig } from "../types";
import { RpcTransport } from "./codex-app-server-transport";
import { ConversationSession } from "./codex-app-server-conversation";
import { CodexObservability } from "./codex-app-server-observability";
import { spawnCodexViewer } from "./codex-app-server-viewer";
import type { ViewerHandle } from "./codex-app-server-viewer";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CodexAppServerDaemonOptions {
  config: AIConfig;
  /** Absolute path to the project the daemon operates on. */
  projectPath: string;
}

// ─── Daemon ───────────────────────────────────────────────────────────────────

/**
 * Headless daemon that drives `codex app-server` via JSON-RPC 2.0 over stdio.
 *
 * Lifecycle per daemon instance:
 *   start()  → spawn process → initialize → checkAuth → newConversation → subscribe
 *   send()   → sendUserTurn RPC (response streams in as notifications)
 *   check()  → return accumulated text once task_complete fires
 *   stop()   → close stdin → wait for process exit
 */
export class CodexAppServerDaemon extends AIDaemon {
  readonly name = "codex-app-server";
  readonly config: AIConfig;

  private readonly projectPath: string;

  // Process state
  private proc: ChildProcess | null = null;

  // Sub-objects
  private transport: RpcTransport | null = null;
  private readonly session = new ConversationSession();
  private readonly observability: CodexObservability;
  private viewer: ViewerHandle | null = null;

  constructor(options: CodexAppServerDaemonOptions) {
    super();
    this.config = options.config;
    this.projectPath = options.projectPath;
    this.observability = new CodexObservability(
      join(homedir(), ".claude", "oh-my-claude", "logs", "codex-activity.jsonl"),
      join(homedir(), ".claude", "oh-my-claude", "run", "codex-status.json"),
    );
  }

  override getProjectPath(): string | null {
    return this.projectPath;
  }

  // ─── AIDaemon contract ──────────────────────────────────────────────────────

  async start(): Promise<void> {
    await this.verifyCodexInstallation();

    this.proc = spawn(
      this.config.cliCommand,
      [...(this.config.cliArgs ?? [])],
      {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: this.projectPath,
        windowsHide: true,
        shell: process.platform === "win32",
      },
    );

    this.transport = new RpcTransport(this.proc);
    this.transport.attach((method, params) => {
      this.session.handleNotification(method, params, this.observability);
    });

    this.proc.stderr!.on("data", (chunk: Buffer) => {
      process.stderr.write(`[codex-app-server] ${chunk.toString("utf8")}`);
    });

    this.proc.on("error", (err) => {
      this.transport?.rejectAll(err);
      this.setStatus("error");
    });

    this.proc.on("close", (code) => {
      if (this.status === "running" && code !== 0 && code !== null) {
        const err = new Error(`codex app-server exited with code ${code}`);
        this.transport?.rejectAll(err);
        this.setStatus("error");
        if (!this.session.turnComplete && !this.session.turnError) {
          this.session.turnError = err;
        }
      }
    });

    // Step 1: initialize (required before any other RPC)
    await this.transport.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "oh-my-claude", version: "1.0.0" },
    });

    // Step 2: check auth
    await this.session.checkAuth(this.transport);

    // Step 3: new conversation
    await this.session.initConversation(this.transport, this.projectPath);

    this.observability.writeActivityLog("session_start", this.projectPath, this.session.convModel);
    this.observability.writeStatusSignal("idle", undefined, this.session.convModel);

    // Auto-open conversation viewer (tmux split, WezTerm split, or new terminal window).
    // Fire-and-forget: viewer spawn never blocks start() or throws.
    if (this.viewer === null) {
      this.viewer = spawnCodexViewer();
    }
  }

  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc) return;

    try { proc.stdin!.end(); } catch { /* already closed */ }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { proc.kill("SIGKILL"); resolve(); }, 5_000);
      proc.once("close", () => { clearTimeout(timer); resolve(); });
    });

    this.transport?.rejectAll(new Error("Daemon stopped"));
    this.proc = null;
    this.transport = null;
    this.session.conversationId = null;
    this.viewer?.close();
    this.viewer = null;
    this.observability.writeStatusSignal("idle");
  }

  async send(message: string): Promise<void> {
    if (!this.session.conversationId || !this.transport) {
      throw new Error("codex-app-server: no active conversation — daemon not started");
    }

    this.session.resetTurnState();
    this.observability.writeActivityLog("user_turn", message);
    this.observability.writeStatusSignal("thinking", undefined, this.session.convModel);

    await this.transport.send("sendUserTurn", {
      conversationId: this.session.conversationId,
      items: [{ type: "text", data: { text: message, text_elements: [] } }],
      cwd: this.projectPath,
      approvalPolicy: "never",
      sandboxPolicy: { type: "danger-full-access" },
      model: this.session.convModel,
      effort: null,
      summary: "auto",
      outputSchema: null,
    });
  }

  async checkResponse(): Promise<string | null> {
    if (this.session.turnError) {
      const err = this.session.turnError;
      this.session.turnError = null;
      throw err;
    }

    if (this.session.turnComplete) {
      this.session.turnComplete = false;
      const text = this.session.messageBuffer.trim() || this.session.lastAgentMessage || "(no response)";
      // Signal "complete" so the statusline codex segment shows ✓ briefly (5s window)
      this.observability.writeStatusSignal("complete", undefined, this.session.convModel);
      return text;
    }

    return null;
  }

  // ─── Private: bootstrap checks ─────────────────────────────────────────────

  private verifyCodexInstallation(): Promise<void> {
    return this.runCommand(this.config.cliCommand, ["--version"], 8_000);
  }

  private runCommand(command: string, args: string[], timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "ignore", "pipe"],
        shell: process.platform === "win32",
        windowsHide: true,
      });

      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
      }, timeoutMs);

      child.stderr?.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
      child.on("error", (err) => { clearTimeout(timer); reject(err); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(
            `Command failed (${code ?? "unknown"}): ${command} ${args.join(" ")} ${stderr}`.trim(),
          ));
        }
      });
    });
  }
}
