import type { Message, Watcher } from "./types"

/**
 * Provider-agnostic storage adapter contract.
 *
 * Implementations read provider logs and normalize them into Message[],
 * and expose a watch API for near real-time updates.
 */
export interface StorageAdapter {
  /** Adapter identifier (for example: "codex"). */
  readonly name: string

  /**
   * Read and parse a full session from provider storage.
   */
  readSession(sessionId: string): Promise<Message[]>

  /**
   * Watch a session for log changes and emit updated parsed messages.
   */
  watch(sessionId: string, callback: (messages: Message[]) => void): Watcher
}
