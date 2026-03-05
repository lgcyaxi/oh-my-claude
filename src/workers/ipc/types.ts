export interface IPCChannel {
  readonly path: string;
  readonly isWindows: boolean;

  create(): Promise<void>;
  destroy(): Promise<void>;
  write(data: string): Promise<void>;
  onData(callback: (data: string) => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface IPCChannelOptions {
  readonly name: string;
  readonly runtimeDir?: string;
}
