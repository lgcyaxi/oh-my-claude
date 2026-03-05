/**
 * Shared storage-layer type definitions.
 *
 * These types normalize provider-specific logs into a common message model
 * used by bridge components.
 */

/**
 * Canonical roles supported by bridge message parsing.
 */
export type MessageRole = "user" | "assistant" | "system"

/**
 * Normalized message extracted from provider storage.
 */
export interface Message {
  /** Stable identifier for this message within a session. */
  id: string
  /** Sender role. */
  role: MessageRole
  /** Flattened text content. */
  content: string
  /** Message timestamp converted to Date. */
  timestamp: Date
}

/**
 * Minimal watcher abstraction used by storage adapters.
 */
export interface Watcher {
  /** Stop file watching and release resources. */
  close(): void
}

/**
 * Supported Codex content block variants.
 */
export type CodexContentType = "input_text" | "output_text" | "input_image"

/**
 * Single content block in Codex log payloads.
 */
export interface CodexContentItem {
  type?: CodexContentType | string
  text?: string
}

/**
 * Known top-level entry types written by Codex JSONL logs.
 */
export type CodexLogEntryType =
  | "user_message"
  | "response_item"
  | "tool_call"
  | "tool_result"
  | string

/**
 * Codex JSONL log entry shape.
 */
export interface CodexLogEntry {
  type?: CodexLogEntryType
  payload?: {
    role?: MessageRole | string
    content?: CodexContentItem[]
    [key: string]: unknown
  }
  timestamp?: string
  [key: string]: unknown
}
