import { spawn } from "node:child_process";
import type { PaneId, PaneInfo, PaneCreateOptions, TerminalBackendName } from "./types";

/**
 * Common terminal backend contract from RFC section 3.3.
 */
export interface TerminalBackend {
  /** Terminal backend identifier. */
  readonly name: TerminalBackendName;

  /**
   * Create a new pane and run the given startup command.
   * Optional splitOptions control pane placement (split direction, target).
   */
  createPane(name: string, command: string, options?: PaneCreateOptions): Promise<PaneId>;

  /**
   * Close an existing pane.
   */
  closePane(paneId: PaneId): Promise<void>;

  /**
   * List all panes currently visible to the backend.
   */
  listPanes(): Promise<PaneInfo[]>;

  /**
   * Inject plain text input into a pane.
   */
  injectText(paneId: PaneId, text: string): Promise<void>;

  /**
   * Send backend-specific key sequence(s) to a pane.
   */
  sendKeys(paneId: PaneId, keys: string): Promise<void>;

  /**
   * Check if a pane is still alive.
   */
  isPaneAlive(paneId: PaneId): Promise<boolean>;

  /**
   * Read the last N lines from a pane.
   */
  getPaneOutput(paneId: PaneId, lines: number): Promise<string>;
}

/**
 * Error raised when terminal command execution fails.
 */
export class TerminalBackendError extends Error {
  readonly command: string;
  readonly args: string[];
  readonly stderr: string;
  readonly exitCode: number | null;

  constructor(params: {
    message: string;
    command: string;
    args: string[];
    stderr?: string;
    exitCode?: number | null;
  }) {
    super(params.message);
    this.name = "TerminalBackendError";
    this.command = params.command;
    this.args = params.args;
    this.stderr = params.stderr ?? "";
    this.exitCode = params.exitCode ?? null;
  }
}

/**
 * Shared primitives for backend implementations.
 */
export abstract class BaseTerminalBackend implements TerminalBackend {
  abstract readonly name: TerminalBackendName;

  private readonly paneRegistry = new Map<PaneId, PaneInfo>();

  abstract createPane(name: string, command: string, options?: PaneCreateOptions): Promise<PaneId>;
  abstract closePane(paneId: PaneId): Promise<void>;
  abstract listPanes(): Promise<PaneInfo[]>;
  abstract injectText(paneId: PaneId, text: string): Promise<void>;
  abstract sendKeys(paneId: PaneId, keys: string): Promise<void>;
  abstract isPaneAlive(paneId: PaneId): Promise<boolean>;
  abstract getPaneOutput(paneId: PaneId, lines: number): Promise<string>;

  /**
   * Execute a command with argument-array semantics to avoid shell expansion.
   */
  protected runCommand(
    command: string,
    args: string[],
    options?: { timeoutMs?: number; cwd?: string; input?: string; shell?: boolean }
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: [options?.input !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
        shell: options?.shell ?? false,
        windowsHide: true,
        cwd: options?.cwd,
      });

      // Write stdin input if provided
      if (options?.input !== undefined && child.stdin) {
        child.stdin.write(options.input);
        child.stdin.end();
      }

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timeoutMs = options?.timeoutMs ?? 30_000;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(
          new TerminalBackendError({
            message: `Command timed out after ${timeoutMs}ms: ${command}`,
            command,
            args,
            stderr,
          })
        );
      }, timeoutMs);

      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        const message =
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? `Command not found: ${command}`
            : error.message;

        reject(
          new TerminalBackendError({
            message,
            command,
            args,
            stderr,
          })
        );
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        if (code !== 0) {
          reject(
            new TerminalBackendError({
              message: `Command failed (${code}): ${command}`,
              command,
              args,
              stderr,
              exitCode: code,
            })
          );
          return;
        }

        resolve({ stdout, stderr });
      });
    });
  }

  /**
   * Execute a command but resolve even if exit code is non-zero.
   * Useful for commands like `wezterm cli list` which return exit 1 on
   * Windows/Git Bash despite valid stdout output.
   */
  protected runCommandRaw(
    command: string,
    args: string[],
    options?: { timeoutMs?: number; cwd?: string; input?: string; shell?: boolean }
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: [options?.input !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
        shell: options?.shell ?? false,
        windowsHide: true,
        cwd: options?.cwd,
      });

      if (options?.input !== undefined && child.stdin) {
        child.stdin.write(options.input);
        child.stdin.end();
      }

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timeoutMs = options?.timeoutMs ?? 30_000;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(
          new TerminalBackendError({
            message: `Command timed out after ${timeoutMs}ms: ${command}`,
            command,
            args,
            stderr,
          })
        );
      }, timeoutMs);

      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const message =
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? `Command not found: ${command}`
            : error.message;
        reject(
          new TerminalBackendError({
            message,
            command,
            args,
            stderr,
          })
        );
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ stdout, stderr, exitCode: code });
      });
    });
  }

  /**
   * Probe whether an executable can be invoked in the current environment.
   */
  protected async commandExists(command: string, versionArgs: string[]): Promise<boolean> {
    try {
      await this.runCommand(command, versionArgs, { timeoutMs: 5_000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Record pane metadata after successful creation.
   */
  protected registerPane(info: PaneInfo): void {
    this.paneRegistry.set(info.id, info);
  }

  /**
   * Remove pane metadata when pane is closed.
   */
  protected unregisterPane(paneId: PaneId): void {
    this.paneRegistry.delete(paneId);
  }

  /**
   * Retrieve tracked pane metadata, if available.
   */
  protected getTrackedPane(paneId: PaneId): PaneInfo | undefined {
    return this.paneRegistry.get(paneId);
  }

  /**
   * Snapshot of all tracked panes created through this backend instance.
   */
  protected getTrackedPanes(): PaneInfo[] {
    return [...this.paneRegistry.values()];
  }
}
