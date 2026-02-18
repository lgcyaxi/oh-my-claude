import { createReadStream } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { createInterface } from "node:readline"
import type { CodexLogEntry } from "./types"

/**
 * Read up to `count` trailing non-empty lines from a file.
 *
 * Uses a streaming line reader to avoid loading the whole file into memory.
 * Returns an empty array when the file does not exist.
 */
export async function readLastLines(filePath: string, count: number): Promise<string[]> {
  if (count <= 0) {
    return []
  }

  const stream = createReadStream(filePath, { encoding: "utf-8" })
  const lines: string[] = []

  try {
    const lineReader = createInterface({
      input: stream,
      crlfDelay: Infinity,
    })

    for await (const line of lineReader) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      lines.push(trimmed)
      if (lines.length > count) {
        lines.shift()
      }
    }

    return lines
  } catch (error) {
    const isMissing =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"

    if (isMissing) {
      return []
    }

    throw error
  } finally {
    stream.close()
  }
}

/**
 * Parse newline-delimited JSON content and skip malformed lines.
 */
export function parseJSONL<T = unknown>(content: string): T[] {
  const entries: T[] = []

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    try {
      entries.push(JSON.parse(line) as T)
    } catch {
    }
  }

  return entries
}

/**
 * Best-effort Codex session ID discovery for a project.
 *
 * Strategy:
 * 1. Prefer the most recently modified JSONL file that references projectPath
 * 2. Fall back to newest JSONL file in ~/.codex/sessions
 */
export async function getCodexSessionId(projectPath: string): Promise<string> {
  const sessionsDir = join(homedir(), ".codex", "sessions")

  let files: string[] = []
  try {
    files = await readdir(sessionsDir)
  } catch (error) {
    const isMissing =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"

    if (isMissing) {
      throw new Error(`Codex sessions directory not found: ${sessionsDir}`)
    }

    throw error
  }

  const candidates = files.filter((file) => file.endsWith(".jsonl"))
  if (candidates.length === 0) {
    throw new Error(`No Codex sessions found in: ${sessionsDir}`)
  }

  const withStats = await Promise.all(
    candidates.map(async (fileName) => {
      const filePath = join(sessionsDir, fileName)
      const info = await stat(filePath)
      return {
        fileName,
        filePath,
        mtimeMs: info.mtimeMs,
      }
    })
  )

  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs)

  const normalizedProjectPath = normalizePath(projectPath)

  for (const candidate of withStats.slice(0, 20)) {
    const lines = await readLastLines(candidate.filePath, 80)
    const entries = parseJSONL<CodexLogEntry>(lines.join("\n"))
    if (entries.some((entry) => entryReferencesProject(entry, normalizedProjectPath))) {
      return basename(candidate.fileName, ".jsonl")
    }
  }

  const newest = withStats[0]
  if (!newest) {
    throw new Error(`No Codex sessions found in: ${sessionsDir}`)
  }

  return basename(newest.fileName, ".jsonl")
}

function normalizePath(value: string): string {
  return value.replace(/\\/gu, "/").toLowerCase()
}

function entryReferencesProject(entry: unknown, normalizedProjectPath: string): boolean {
  if (typeof entry === "string") {
    return normalizePath(entry).includes(normalizedProjectPath)
  }

  if (Array.isArray(entry)) {
    return entry.some((value) => entryReferencesProject(value, normalizedProjectPath))
  }

  if (!entry || typeof entry !== "object") {
    return false
  }

  return Object.values(entry).some((value) => entryReferencesProject(value, normalizedProjectPath))
}
