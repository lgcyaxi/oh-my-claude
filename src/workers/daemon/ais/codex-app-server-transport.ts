/**
 * RPC transport layer for codex app-server.
 *
 * Handles all JSON-RPC 2.0 wire I/O: writing requests to stdin,
 * reading newline-delimited responses from stdout, and dispatching
 * to pending-request promises or notification callbacks.
 */

import type { ChildProcess } from "node:child_process";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown;
}

export interface RpcResponse {
  jsonrpc?: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
  method?: string;
  params?: unknown;
}

export interface PendingRpc {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export type NotificationCallback = (method: string, params: unknown) => void;

// ─── Transport ────────────────────────────────────────────────────────────────

/**
 * JSON-RPC 2.0 transport over a ChildProcess stdin/stdout pair.
 *
 * Lifecycle:
 *   - Construct with the spawned process
 *   - Call `attach(onNotification)` to start reading stdout
 *   - Call `send(method, params)` to make RPC calls
 *   - Call `rejectAll(error)` when the process dies
 */
export class RpcTransport {
  private lineBuffer = "";
  private rpcIdCounter = 0;
  private readonly pendingRpcs = new Map<number, PendingRpc>();
  private onNotification: NotificationCallback = () => {};

  constructor(private readonly proc: ChildProcess) {}

  /** Attach stdout reader and notification handler. Must be called once after construction. */
  attach(onNotification: NotificationCallback): void {
    this.onNotification = onNotification;

    this.proc.stdout!.on("data", (chunk: Buffer) => {
      this.lineBuffer += chunk.toString("utf8");
      let nl = this.lineBuffer.indexOf("\n");
      while (nl !== -1) {
        const line = this.lineBuffer.slice(0, nl).trim();
        this.lineBuffer = this.lineBuffer.slice(nl + 1);
        if (line) {
          this.processLine(line);
        }
        nl = this.lineBuffer.indexOf("\n");
      }
    });
  }

  /** Send a JSON-RPC request and return the result promise. */
  send(method: string, params: unknown): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      if (!this.proc?.stdin) {
        reject(new Error("codex-app-server: process not running"));
        return;
      }

      const id = ++this.rpcIdCounter;
      this.pendingRpcs.set(id, { resolve, reject });

      const request: RpcRequest = { jsonrpc: "2.0", id, method, params };
      const line = `${JSON.stringify(request)}\n`;

      this.proc.stdin.write(line, (err) => {
        if (err) {
          this.pendingRpcs.delete(id);
          reject(err);
        }
      });
    });
  }

  /** Parse one line and dispatch to pending RPC or notification handler. */
  processLine(line: string): void {
    let msg: RpcResponse;
    try {
      msg = JSON.parse(line) as RpcResponse;
    } catch {
      return; // Ignore malformed lines
    }

    // JSON-RPC response (has numeric `id`): resolve or reject pending request
    if (typeof msg.id === "number") {
      const pending = this.pendingRpcs.get(msg.id);
      if (pending) {
        this.pendingRpcs.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(`RPC ${msg.method ?? msg.id}: ${msg.error.message}`));
        } else {
          pending.resolve(msg.result ?? {});
        }
      }
      return;
    }

    // JSON-RPC notification (has `method` but no `id`)
    if (msg.method) {
      this.onNotification(msg.method, msg.params);
    }
  }

  /** Reject all in-flight requests (called on process error/close). */
  rejectAll(error: Error): void {
    for (const { reject } of this.pendingRpcs.values()) {
      reject(error);
    }
    this.pendingRpcs.clear();
  }
}
