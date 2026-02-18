import { watch as watchFile } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve, normalize } from "node:path"
import type { StorageAdapter } from "./base"
import type { Message, MessageRole, Watcher } from "./types"

interface OpenCodeProjectFile {
  id?: string
  worktree?: string
  vcs?: string
}

interface OpenCodeSessionFile {
  id?: string
  projectId?: string
  projectID?: string
  createdAt?: string
  messages?: string[]
  time?: { created?: number; updated?: number }
}

interface OpenCodeMessageFile {
  id?: string
  sessionId?: string
  role?: string
  contentParts?: string[]
  createdAt?: string
}

interface OpenCodePartFile {
  id?: string
  messageId?: string
  type?: string
  content?: string
  createdAt?: string
}

export class OpenCodeStorageAdapter implements StorageAdapter {
  readonly name = "opencode"

  private readonly storageDir = join(homedir(), ".local", "share", "opencode", "storage")

  async readSession(projectId: string): Promise<Message[]> {
    const latestSession = await this.readLatestSession(projectId)
    if (!latestSession) {
      return []
    }

    const sessionId = latestSession.id
    if (!sessionId) {
      return []
    }

    const messageDir = join(this.storageDir, "message", sessionId)
    const messageFiles = await this.readDirectorySafe(messageDir)
    if (messageFiles.length === 0) {
      return []
    }

    const parsedMessages = await Promise.all(
      messageFiles
        .filter((fileName) => fileName.startsWith("msg_") && fileName.endsWith(".json"))
        .map(async (fileName) => {
          const messagePath = join(messageDir, fileName)
          const message = await this.readJsonFile<OpenCodeMessageFile>(messagePath)
          if (!message?.id) {
            return null
          }

          const role = this.normalizeRole(message.role)
          if (!role) {
            return null
          }

          const timestamp = this.parseTimestamp(message.createdAt)
          if (!timestamp) {
            return null
          }

          const content = await this.readMessageContent(message)
          if (!content) {
            return null
          }

          return {
            id: message.id,
            role,
            content,
            timestamp,
          } satisfies Message
        })
    )

    const messages = parsedMessages.filter((item): item is Message => Boolean(item))

    if (Array.isArray(latestSession.messages) && latestSession.messages.length > 0) {
      const order = new Map(latestSession.messages.map((id, index) => [id, index]))
      messages.sort((left, right) => {
        const leftIndex = order.get(left.id)
        const rightIndex = order.get(right.id)

        if (leftIndex !== undefined && rightIndex !== undefined) {
          return leftIndex - rightIndex
        }

        if (leftIndex !== undefined) {
          return -1
        }

        if (rightIndex !== undefined) {
          return 1
        }

        return left.timestamp.getTime() - right.timestamp.getTime()
      })
      return messages
    }

    messages.sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
    return messages
  }

  watch(projectId: string, callback: (messages: Message[]) => void): Watcher {
    // Note: watch uses projectId as-is for directory paths.
    // resolveProjectId is async so we kick off initial resolution and adjust.
    const watchTargets = [
      join(this.storageDir, "session"),
      join(this.storageDir, "message"),
      join(this.storageDir, "part"),
    ]

    let disposed = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const watchers: Array<{ close: () => void }> = []

    const refresh = async () => {
      if (disposed) {
        return
      }

      try {
        callback(await this.readSession(projectId))
      } catch {
      }
    }

    const scheduleRefresh = () => {
      if (disposed) {
        return
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      debounceTimer = setTimeout(() => {
        void refresh()
      }, 100)
    }

    for (const target of watchTargets) {
      try {
        const watcher = watchFile(target, { recursive: true }, () => {
          scheduleRefresh()
        })
        watchers.push(watcher)
      } catch {
      }
    }

    const pollTimer = setInterval(() => {
      void refresh()
    }, 2_000)

    void refresh()

    return {
      close: () => {
        disposed = true
        if (debounceTimer) {
          clearTimeout(debounceTimer)
        }
        clearInterval(pollTimer)
        for (const watcher of watchers) {
          watcher.close()
        }
      },
    }
  }

  /**
   * Resolve a project path to an OpenCode project hash.
   *
   * OpenCode v1.1+ uses git root commit hashes as project IDs.
   * The mapping is stored in `storage/project/{hash}.json` with a `worktree` field.
   * Falls back to using projectId directly (for older versions or hash inputs).
   */
  private async resolveProjectId(projectPathOrId: string): Promise<string> {
    const projectDir = join(this.storageDir, "project")
    const files = await this.readDirectorySafe(projectDir)

    const normalizedInput = normalize(resolve(projectPathOrId)).toLowerCase()

    for (const fileName of files) {
      if (!fileName.endsWith(".json")) continue
      const fullPath = join(projectDir, fileName)
      const project = await this.readJsonFile<OpenCodeProjectFile>(fullPath)
      if (!project?.worktree) continue

      const normalizedWorktree = normalize(resolve(project.worktree)).toLowerCase()
      if (normalizedWorktree === normalizedInput) {
        return project.id ?? fileName.replace(/\.json$/, "")
      }
    }

    // Fallback: use as-is (may be a hash already, or old-style project ID)
    return projectPathOrId
  }

  private async readLatestSession(projectId: string): Promise<OpenCodeSessionFile | null> {
    // Resolve project path to hash if needed
    const resolvedId = await this.resolveProjectId(projectId)
    const sessionDir = join(this.storageDir, "session", resolvedId)
    const sessionFiles = (await this.readDirectorySafe(sessionDir))
      .filter((fileName) => fileName.startsWith("ses_") && fileName.endsWith(".json"))
      .sort()

    if (sessionFiles.length === 0) {
      return null
    }

    const parsedSessions = await Promise.all(
      sessionFiles.map(async (fileName) => {
        const fullPath = join(sessionDir, fileName)
        const parsed = await this.readJsonFile<OpenCodeSessionFile>(fullPath)
        if (!parsed?.id) {
          return null
        }

        // Support both old format (createdAt string) and new format (time.created number)
        let timestamp: number = 0
        if (parsed.time?.created) {
          timestamp = parsed.time.created
        } else {
          const ts = this.parseTimestamp(parsed.createdAt)
          timestamp = ts?.getTime() ?? 0
        }

        return {
          session: parsed,
          timestamp,
          fileName,
        }
      })
    )

    const sessions = parsedSessions.filter(
      (item): item is { session: OpenCodeSessionFile; timestamp: number; fileName: string } => Boolean(item)
    )
    if (sessions.length === 0) {
      return null
    }

    sessions.sort((left, right) => {
      if (left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp
      }
      return left.fileName.localeCompare(right.fileName)
    })

    return sessions[sessions.length - 1]?.session ?? null
  }

  private async readMessageContent(message: OpenCodeMessageFile): Promise<string> {
    if (!message.id) {
      return ""
    }

    const partDir = join(this.storageDir, "part", message.id)
    const partFiles = await this.readDirectorySafe(partDir)
    if (partFiles.length === 0) {
      return ""
    }

    const parsedParts = await Promise.all(
      partFiles
        .filter((fileName) => fileName.startsWith("prt_") && fileName.endsWith(".json"))
        .map(async (fileName) => {
          const fullPath = join(partDir, fileName)
          const parsed = await this.readJsonFile<OpenCodePartFile>(fullPath)
          if (!parsed?.id || parsed.messageId !== message.id) {
            return null
          }

          return {
            id: parsed.id,
            content: parsed.content ?? "",
            timestamp: this.parseTimestamp(parsed.createdAt)?.getTime() ?? 0,
            fileName,
          }
        })
    )

    const parts = parsedParts.filter(
      (item): item is { id: string; content: string; timestamp: number; fileName: string } => Boolean(item)
    )

    if (Array.isArray(message.contentParts) && message.contentParts.length > 0) {
      const order = new Map(message.contentParts.map((id, index) => [id, index]))
      parts.sort((left, right) => {
        const leftIndex = order.get(left.id)
        const rightIndex = order.get(right.id)

        if (leftIndex !== undefined && rightIndex !== undefined) {
          return leftIndex - rightIndex
        }

        if (leftIndex !== undefined) {
          return -1
        }

        if (rightIndex !== undefined) {
          return 1
        }

        if (left.timestamp !== right.timestamp) {
          return left.timestamp - right.timestamp
        }

        return left.fileName.localeCompare(right.fileName)
      })
    } else {
      parts.sort((left, right) => {
        if (left.timestamp !== right.timestamp) {
          return left.timestamp - right.timestamp
        }

        return left.fileName.localeCompare(right.fileName)
      })
    }

    return parts.map((part) => part.content).join("").trim()
  }

  private normalizeRole(role: string | undefined): MessageRole | null {
    if (role === "user" || role === "assistant" || role === "system") {
      return role
    }

    return null
  }

  private parseTimestamp(raw: string | undefined): Date | null {
    if (!raw) {
      return null
    }

    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }

    return parsed
  }

  private async readDirectorySafe(path: string): Promise<string[]> {
    try {
      return await readdir(path)
    } catch (error) {
      if (this.isErrorCode(error, "ENOENT")) {
        return []
      }

      throw new Error(`Failed to read OpenCode storage directory: ${path}`, {
        cause: error,
      })
    }
  }

  private async readJsonFile<T>(filePath: string): Promise<T | null> {
    let content = ""

    try {
      content = await readFile(filePath, "utf-8")
    } catch (error) {
      if (this.isErrorCode(error, "ENOENT")) {
        return null
      }
      throw error
    }

    try {
      return JSON.parse(content) as T
    } catch {
      return null
    }
  }

  private isErrorCode(error: unknown, expectedCode: string): boolean {
    return Boolean(
      error
        && typeof error === "object"
        && "code" in error
        && (error as { code?: string }).code === expectedCode
    )
  }
}
