/**
 * Storage adapter barrel exports.
 */

export type {
  MessageRole,
  Message,
  Watcher,
  CodexContentType,
  CodexContentItem,
  CodexLogEntryType,
  CodexLogEntry,
} from "./types"

export type { StorageAdapter } from "./base"

export { CodexStorageAdapter } from "./codex"
export { OpenCodeStorageAdapter } from "./opencode"

export { readLastLines, parseJSONL, getCodexSessionId } from "./utils"
