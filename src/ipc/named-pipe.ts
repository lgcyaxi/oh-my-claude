import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { appendFile, chmod, rm } from "node:fs/promises";
import { connect, createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import type { IPCChannel, IPCChannelOptions } from "./types";

const WINDOWS_PIPE_PREFIX = "\\\\.\\pipe\\";
const PIPE_NAME_PREFIX = "oh-my-claude-bridge-";

function sanitizeChannelName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/gu, "_");
}

function createWindowsPipePath(name: string): string {
  return `${WINDOWS_PIPE_PREFIX}${PIPE_NAME_PREFIX}${sanitizeChannelName(name)}`;
}

function createUnixFifoPath(name: string, runtimeDir: string): string {
  return join(runtimeDir, `${sanitizeChannelName(name)}_fifo`);
}

function emitToCallbacks<T>(callbacks: Set<(value: T) => void>, value: T): void {
  for (const callback of callbacks) {
    callback(value);
  }
}

function createLineEmitter(onLine: (line: string) => void): (chunk: Buffer | string) => void {
  let buffer = "";

  return (chunk: Buffer | string) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      onLine(line.replace(/\r$/u, ""));
    }
  };
}

export class WindowsNamedPipeChannel implements IPCChannel {
  readonly isWindows = true;
  readonly path: string;

  private server: Server | null = null;
  private readonly sockets = new Set<Socket>();
  private readonly dataCallbacks = new Set<(data: string) => void>();
  private readonly errorCallbacks = new Set<(error: Error) => void>();

  constructor(name: string) {
    // Add random suffix to avoid conflicts with previous runs
    const uniqueSuffix = Math.random().toString(36).substring(2, 8);
    this.path = createWindowsPipePath(`${name}-${uniqueSuffix}`);
  }

  async create(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((socket) => {
      this.sockets.add(socket);
      const emitLine = createLineEmitter((line) => {
        emitToCallbacks(this.dataCallbacks, line);
      });

      socket.on("data", emitLine);
      socket.on("error", (error) => {
        emitToCallbacks(this.errorCallbacks, error);
      });
      socket.on("close", () => {
        this.sockets.delete(socket);
      });
    });

    this.server.on("error", (error) => {
      emitToCallbacks(this.errorCallbacks, error);
    });

    await new Promise<void>((resolve, reject) => {
      const server = this.server;
      if (!server) {
        reject(new Error("Named pipe server is not initialized"));
        return;
      }

      const handleError = (error: Error): void => {
        server.off("listening", handleListening);
        reject(error);
      };

      const handleListening = (): void => {
        server.off("error", handleError);
        resolve();
      };

      server.once("error", handleError);
      server.once("listening", handleListening);
      server.listen(this.path);
    });
  }

  async destroy(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();

    const server = this.server;
    this.server = null;

    if (!server) {
      return;
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  async write(data: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = connect(this.path);

      const timeout = setTimeout(() => {
        socket.destroy(new Error(`Timed out writing to named pipe: ${this.path}`));
      }, 5_000);

      socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      socket.once("connect", () => {
        socket.write(data, (error) => {
          if (error) {
            clearTimeout(timeout);
            reject(error);
            return;
          }

          socket.end(() => {
            clearTimeout(timeout);
            resolve();
          });
        });
      });
    });
  }

  onData(callback: (data: string) => void): void {
    this.dataCallbacks.add(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.add(callback);
  }
}

export class UnixFIFOChannel implements IPCChannel {
  readonly isWindows = false;
  readonly path: string;

  private isCreated = false;
  private readStream: ReturnType<typeof createReadStream> | null = null;
  private readonly dataCallbacks = new Set<(data: string) => void>();
  private readonly errorCallbacks = new Set<(error: Error) => void>();

  constructor(name: string, runtimeDir: string) {
    this.path = createUnixFifoPath(name, runtimeDir);
  }

  async create(): Promise<void> {
    if (process.platform === "win32") {
      throw new Error("Unix FIFO channel is not available on Windows");
    }

    await rm(this.path, { force: true });
    await runCommand("mkfifo", [this.path], 5_000);
    await chmod(this.path, 0o600);
    this.isCreated = true;

    if (this.dataCallbacks.size > 0) {
      this.ensureReadStream();
    }
  }

  async destroy(): Promise<void> {
    this.isCreated = false;
    this.readStream?.destroy();
    this.readStream = null;
    await rm(this.path, { force: true });
  }

  async write(data: string): Promise<void> {
    await appendFile(this.path, data, "utf8");
  }

  onData(callback: (data: string) => void): void {
    this.dataCallbacks.add(callback);
    if (this.isCreated) {
      this.ensureReadStream();
    }
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.add(callback);
  }

  private ensureReadStream(): void {
    if (this.readStream) {
      return;
    }

    const stream = createReadStream(this.path, {
      encoding: "utf8",
      flags: "r+",
    });

    const emitLine = createLineEmitter((line) => {
      emitToCallbacks(this.dataCallbacks, line);
    });

    stream.on("data", emitLine);
    stream.on("error", (error) => {
      emitToCallbacks(this.errorCallbacks, error);
    });
    stream.on("close", () => {
      if (this.readStream === stream) {
        this.readStream = null;
      }
    });

    this.readStream = stream;
  }
}

export function createIPCChannel(options: IPCChannelOptions): IPCChannel {
  if (process.platform === "win32") {
    return new WindowsNamedPipeChannel(options.name);
  }

  if (!options.runtimeDir) {
    throw new Error("runtimeDir is required for Unix FIFO IPC channels");
  }

  return new UnixFIFOChannel(options.name, options.runtimeDir);
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
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
