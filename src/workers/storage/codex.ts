import { watch as watchFile } from "node:fs"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import type { StorageAdapter } from "./base"
import type { CodexLogEntry, Message, MessageRole, Watcher } from "./types"
import { parseJSONL } from "./utils"

/**
 * Storage adapter for Codex JSONL session logs.
 *
 * Reads `~/.codex/sessions/{sessionId}.jsonl`, extracts user and assistant
 * messages, and supports file watching for real-time updates.
 */
export class CodexStorageAdapter implements StorageAdapter {
  readonly name = "codex"

  /**
   * Parse all supported message entries from a Codex session file.
   * Returns an empty list when the session file does not exist.
   */
  async readSession(sessionId: string): Promise<Message[]> {
    const logPath = this.getSessionPath(sessionId)

    let content = ""
    try {
      content = await readFile(logPath, "utf-8")
    } catch (error) {
      if (this.isErrorCode(error, "ENOENT")) {
        return []
      }

      throw new Error(`Failed to read Codex session: ${logPath}`, {
        cause: error,
      })
    }

    const entries = parseJSONL<CodexLogEntry>(content)
    const messages: Message[] = []

    for (const [index, entry] of entries.entries()) {
      const message = this.entryToMessage(entry, sessionId, index)
      if (message) {
        messages.push(message)
      }
    }

    return messages
  }

  /**
   * Watch a Codex session file and emit fully parsed messages on change.
   */
  watch(sessionId: string, callback: (messages: Message[]) => void): Watcher {
    const filePath = this.getSessionPath(sessionId)
    const sessionsDir = join(filePath, "..")
    const expectedFile = basename(filePath)
    let disposed = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const refresh = async () => {
      if (disposed) {
        return
      }

      try {
        callback(await this.readSession(sessionId))
      } catch {
      }
    }

    const watcher = watchFile(sessionsDir, (eventType, fileName) => {
      if (disposed || (eventType !== "change" && eventType !== "rename")) {
        return
      }

      if (!fileName || fileName.toString() !== expectedFile) {
        return
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      debounceTimer = setTimeout(() => {
        void refresh()
      }, 75)
    })

    void refresh()

    return {
      close: () => {
        disposed = true
        if (debounceTimer) {
          clearTimeout(debounceTimer)
        }
        watcher.close()
      },
    }
  }

  private getSessionPath(sessionId: string): string {
    // Support both full paths (from findLatestCodexSession) and legacy flat IDs
    if (sessionId.startsWith("/") || sessionId.endsWith(".jsonl")) {
      return sessionId
    }
    return join(homedir(), ".codex", "sessions", `${sessionId}.jsonl`)
  }

  private entryToMessage(entry: CodexLogEntry, sessionId: string, index: number): Message | null {
    if (!entry || (entry.type !== "user_message" && entry.type !== "response_item")) {
      return null
    }

    const role = this.normalizeRole(entry.payload?.role)
    if (!role) {
      return null
    }

    const content = this.extractText(entry)
    if (!content) {
      return null
    }

    const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date()
    if (Number.isNaN(timestamp.getTime())) {
      return null
    }

    return {
      id: `${sessionId}:${index}:${timestamp.toISOString()}`,
      role,
      content,
      timestamp,
    }
  }

  private normalizeRole(role: string | undefined): MessageRole | null {
    if (role === "user" || role === "assistant" || role === "system") {
      return role
    }

    return null
  }

  private extractText(entry: CodexLogEntry): string {
    const contentItems = entry.payload?.content
    if (!Array.isArray(contentItems)) {
      return ""
    }

    return contentItems
      .filter((item) => item.type === "input_text" || item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("")
      .trim()
  }

  private isErrorCode(error: unknown, expectedCode: string): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === expectedCode
    )
  }
}
