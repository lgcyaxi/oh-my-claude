#!/usr/bin/env node
/**
 * Unified Context-Memory Hook (PostToolUse + Stop)
 *
 * Single session writer that handles both mid-session checkpoints and
 * session-end capture. Replaces the previous dual-writer setup
 * (context-memory + auto-memory) that produced duplicate summaries.
 *
 * Triggers:
 * - PostToolUse: Fires after each tool call. Saves when session log
 *   exceeds a configurable threshold (~100KB). Only saves delta since
 *   last checkpoint.
 * - Stop: Fires at session end. Has access to transcript + todos from
 *   StopInput. Only summarizes DELTA since last save. Clears the
 *   project-scoped session log.
 *
 * All file paths are project-scoped via `cwd` from hook JSON input
 * to avoid multi-instance contamination.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

// ---- Input types for different hook events ----

interface PostToolUseInput {
  tool?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: string;
  conversation_id?: string;
  cwd?: string;
  hook_event_name?: string;
}

interface StopInput {
  reason?: string;
  conversation_id?: string;
  transcript?: string;
  todos?: Array<{
    content: string;
    status: "pending" | "in_progress" | "completed";
  }>;
  cwd?: string;
  hook_event_name?: string;
}

type HookInput = PostToolUseInput & StopInput;

interface HookResponse {
  decision: "approve" | "block";
  reason?: string;
  message?: string;
}

// ---- Provider definitions ----

const DEFAULT_PROVIDER_PRIORITY = [
  {
    name: "zhipu",
    model: "GLM-5",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    apiKeyEnv: "ZHIPU_API_KEY",
  },
  {
    name: "minimax",
    model: "MiniMax-M2.5",
    baseUrl: "https://api.minimaxi.com/anthropic",
    apiKeyEnv: "MINIMAX_API_KEY",
  },
  {
    name: "deepseek",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/anthropic",
    apiKeyEnv: "DEEPSEEK_API_KEY",
  },
];

// ---- Constants ----

const DEFAULT_SESSION_LOG_THRESHOLD_KB = 100;
const STATE_DIR = join(homedir(), ".claude", "oh-my-claude", "state");

const CHECKPOINT_PROMPT = `You are a session summarizer. Extract KEY LEARNINGS from this coding session that would be useful for future sessions.

Focus on:
- Architecture decisions and WHY they were made
- Project conventions and patterns discovered
- Problems encountered and their solutions
- User preferences and requirements
- Key technical details (API patterns, gotchas, workarounds)

Output a concise summary (200-400 words). Use markdown bullet points. Be specific and actionable — another AI reading this should immediately benefit.

Do NOT include:
- Trivial details or boilerplate
- Step-by-step implementation details (code is in git)
- Generic advice`;

const SESSION_END_PROMPT = `You are a session summarizer. This session is ending. Extract the KEY LEARNINGS from the RECENT activity (since the last checkpoint) that would be useful for future sessions.

Focus on:
- Architecture decisions and WHY they were made
- Project conventions and patterns discovered
- Problems encountered and their solutions
- User preferences and requirements
- Key technical details (API patterns, gotchas, workarounds)

Output a concise summary (200-400 words). Use markdown bullet points. Be specific and actionable — another AI reading this should immediately benefit.

Do NOT include:
- Trivial details or boilerplate
- Step-by-step implementation details (code is in git)
- Generic advice
- Content that was already covered in a previous checkpoint`;

// ---- Helpers: project-scoped paths ----

function shortHash(str: string): string {
  return createHash("sha256").update(str).digest("hex").slice(0, 8);
}

function getStateFile(projectCwd?: string): string {
  const suffix = projectCwd ? `-${shortHash(projectCwd)}` : "";
  return join(STATE_DIR, `context-memory-state${suffix}.json`);
}

function getSessionLogPath(projectCwd?: string): string {
  const suffix = projectCwd ? `-${shortHash(projectCwd)}` : "";
  return join(homedir(), ".claude", "oh-my-claude", "memory", "sessions", `active-session${suffix}.jsonl`);
}

// ---- State management ----

interface ContextMemoryState {
  lastSaveTimestamp: string | null;
  lastSaveLogSizeKB: number | null;
  saveCount: number;
}

function loadState(projectCwd?: string): ContextMemoryState {
  try {
    const stateFile = getStateFile(projectCwd);
    if (existsSync(stateFile)) {
      const raw = readFileSync(stateFile, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // Ignore
  }
  return { lastSaveTimestamp: null, lastSaveLogSizeKB: null, saveCount: 0 };
}

function saveState(state: ContextMemoryState, projectCwd?: string): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(getStateFile(projectCwd), JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // Ignore
  }
}

// ---- Config ----

function loadConfig(): { threshold: number; providerPriority: string[] } {
  const configPath = join(homedir(), ".claude", "oh-my-claude.json");
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      return {
        threshold: config.memory?.autoSaveThreshold === 0
          ? 0
          : Math.round((config.memory?.autoSaveThreshold ?? 75) * 1.33),
        providerPriority: config.memory?.aiProviderPriority ?? ["zhipu", "minimax", "deepseek"],
      };
    }
  } catch {
    // Ignore config errors
  }
  return {
    threshold: DEFAULT_SESSION_LOG_THRESHOLD_KB,
    providerPriority: ["zhipu", "minimax", "deepseek"],
  };
}

function getOrderedProviders(priority: string[]): typeof DEFAULT_PROVIDER_PRIORITY {
  const providerMap = new Map(DEFAULT_PROVIDER_PRIORITY.map((p) => [p.name, p]));
  const ordered: typeof DEFAULT_PROVIDER_PRIORITY = [];

  for (const name of priority) {
    const provider = providerMap.get(name);
    if (provider) {
      ordered.push(provider);
    }
  }

  for (const provider of DEFAULT_PROVIDER_PRIORITY) {
    if (!ordered.includes(provider)) {
      ordered.push(provider);
    }
  }

  return ordered;
}

// ---- Session log operations ----

function getSessionLogSizeKB(projectCwd?: string): number {
  try {
    const logPath = getSessionLogPath(projectCwd);
    if (!existsSync(logPath)) return 0;
    const stats = statSync(logPath);
    return Math.round(stats.size / 1024);
  } catch {
    return 0;
  }
}

function readSessionLog(projectCwd?: string): string {
  try {
    const logPath = getSessionLogPath(projectCwd);
    if (!existsSync(logPath)) return "";
    const raw = readFileSync(logPath, "utf-8").trim();
    if (!raw) return "";

    const lines = raw.split("\n").filter(Boolean);
    const observations: string[] = [];

    for (const line of lines) {
      try {
        const obs = JSON.parse(line) as { ts: string; tool: string; summary: string };
        const time = obs.ts.slice(11, 19);
        observations.push(`  [${time}] ${obs.tool}: ${obs.summary}`);
      } catch {
        // Skip
      }
    }

    const joined = observations.join("\n");
    return joined.length > 8000 ? "...\n" + joined.slice(-8000) : joined;
  } catch {
    return "";
  }
}

/** Clear session log after session end (project-scoped) */
function clearSessionLog(projectCwd?: string): void {
  try {
    const logPath = getSessionLogPath(projectCwd);
    if (existsSync(logPath)) {
      writeFileSync(logPath, "", "utf-8");
    }
  } catch {
    // Ignore
  }
}

// ---- Provider operations ----

function findAvailableProvider(providers: typeof DEFAULT_PROVIDER_PRIORITY): (typeof DEFAULT_PROVIDER_PRIORITY)[number] | null {
  for (const provider of providers) {
    const apiKey = process.env[provider.apiKeyEnv];
    if (apiKey && apiKey.length > 0) {
      return provider;
    }
  }
  return null;
}

async function callExternalModel(
  provider: (typeof DEFAULT_PROVIDER_PRIORITY)[number],
  context: string,
  prompt: string,
): Promise<string | null> {
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) return null;

  try {
    const response = await fetch(`${provider.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `${prompt}\n\n---\n\nSession context:\n${context}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[context-memory] Provider ${provider.name} returned ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textBlock = data.content?.find((b) => b.type === "text");
    return textBlock?.text ?? null;
  } catch (error) {
    console.error(`[context-memory] Failed to call ${provider.name}:`, error);
    return null;
  }
}

// ---- Memory save ----

function saveSessionMemory(
  summary: string,
  providerUsed: string,
  trigger: "checkpoint" | "session-end",
  logSizeKB: number,
  projectCwd?: string,
): string {
  let memoryDir: string;

  // Find project root from explicit cwd
  let projectRoot: string | null = null;
  if (projectCwd) {
    let dir = projectCwd;
    while (true) {
      if (existsSync(join(dir, ".git"))) {
        projectRoot = dir;
        break;
      }
      const parent = join(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  }

  if (projectRoot) {
    memoryDir = join(projectRoot, ".claude", "mem", "sessions");
  } else {
    memoryDir = join(homedir(), ".claude", "oh-my-claude", "memory", "sessions");
  }

  mkdirSync(memoryDir, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "");
  const prefix = trigger === "session-end" ? "session" : "context-save";
  const id = `${prefix}-${dateStr}-${timeStr}`;

  const titleText = trigger === "session-end"
    ? `Session summary ${dateStr}`
    : `Context checkpoint ${dateStr} (${logSizeKB}KB log)`;

  const tags = trigger === "session-end"
    ? `[auto-capture, session-end, ${providerUsed}]`
    : `[auto-capture, context-threshold, ${providerUsed}]`;

  const frontmatter = [
    "---",
    `title: "${titleText}"`,
    `type: session`,
    `tags: ${tags}`,
    `created: "${now.toISOString()}"`,
    `updated: "${now.toISOString()}"`,
    "---",
  ].join("\n");

  const content = `${frontmatter}\n\n${summary}\n`;
  const filePath = join(memoryDir, `${id}.md`);

  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// ---- Event handlers ----

/**
 * Handle PostToolUse event: checkpoint save when session log exceeds threshold
 */
async function handlePostToolUse(input: HookInput): Promise<HookResponse> {
  // Skip if this is a memory-related tool (avoid recursion)
  const toolName = input.tool || input.tool_name || "";
  if (toolName.includes("memory") || toolName.includes("context-memory")) {
    return { decision: "approve" };
  }

  const projectCwd = input.cwd;
  const config = loadConfig();

  // Skip if threshold is 0 (disabled)
  if (config.threshold === 0) {
    return { decision: "approve" };
  }

  // Get current session log size (project-scoped)
  const logSizeKB = getSessionLogSizeKB(projectCwd);

  // Skip if below threshold
  if (logSizeKB < config.threshold) {
    return { decision: "approve" };
  }

  // Check if we've already saved recently (project-scoped state)
  const state = loadState(projectCwd);

  // Skip if we saved at similar or higher log size (with 20KB buffer)
  if (
    state.lastSaveLogSizeKB !== null &&
    logSizeKB <= state.lastSaveLogSizeKB + 20
  ) {
    return { decision: "approve" };
  }

  // Find available provider
  const providers = getOrderedProviders(config.providerPriority);
  const provider = findAvailableProvider(providers);

  if (!provider) {
    return { decision: "approve" };
  }

  // Build context for summarization (project-scoped log)
  const sessionLog = readSessionLog(projectCwd);

  if (!sessionLog || sessionLog.length < 500) {
    return { decision: "approve" };
  }

  const context = `Session activity log (${logSizeKB}KB, threshold: ${config.threshold}KB):\n\n${sessionLog}`;

  try {
    const summary = await callExternalModel(provider, context, CHECKPOINT_PROMPT);

    if (summary) {
      const filePath = saveSessionMemory(summary, provider.name, "checkpoint", logSizeKB, projectCwd);

      saveState({
        lastSaveTimestamp: new Date().toISOString(),
        lastSaveLogSizeKB: logSizeKB,
        saveCount: state.saveCount + 1,
      }, projectCwd);

      console.error(`[context-memory] Checkpoint saved at ${logSizeKB}KB: ${filePath}`);

      return {
        decision: "approve",
        message: `Context memory auto-saved (${logSizeKB}KB activity, via ${provider.name})`,
      };
    }
  } catch (error) {
    console.error("[context-memory] Checkpoint error:", error);
  }

  return { decision: "approve" };
}

/**
 * Handle Stop event: session-end capture (absorbs auto-memory functionality)
 * Only summarizes DELTA since last checkpoint. Clears session log.
 */
async function handleStop(input: HookInput): Promise<HookResponse> {
  const projectCwd = input.cwd;
  const config = loadConfig();
  const state = loadState(projectCwd);

  // Find available provider
  const providers = getOrderedProviders(config.providerPriority);
  const provider = findAvailableProvider(providers);

  if (!provider) {
    // Clear session log even if no provider (prevent stale accumulation)
    clearSessionLog(projectCwd);
    return { decision: "approve" };
  }

  // Build context from session log + Stop-specific data (transcript, todos)
  const parts: string[] = [];

  if (input.reason) {
    parts.push(`Session end reason: ${input.reason}`);
  }

  if (input.todos && input.todos.length > 0) {
    parts.push("\nTask list:");
    for (const todo of input.todos) {
      const icon =
        todo.status === "completed" ? "+" : todo.status === "in_progress" ? ">" : "o";
      parts.push(`  ${icon} [${todo.status}] ${todo.content}`);
    }
  }

  // Read session log (delta since last save)
  const sessionLog = readSessionLog(projectCwd);
  if (sessionLog) {
    const maxLen = 6000;
    const trimmed = sessionLog.length > maxLen
      ? "...\n" + sessionLog.slice(-maxLen)
      : sessionLog;
    parts.push(`\nTool usage timeline:\n${trimmed}`);
  }

  // Include transcript excerpt if available (unique to Stop event)
  if (input.transcript) {
    const maxLen = 4000;
    const transcript =
      input.transcript.length > maxLen
        ? "..." + input.transcript.slice(-maxLen)
        : input.transcript;
    parts.push(`\nRecent conversation:\n${transcript}`);
  }

  const context = parts.join("\n");

  // Skip if too little content (delta is small since last checkpoint)
  if (context.length < 500) {
    clearSessionLog(projectCwd);
    return { decision: "approve" };
  }

  try {
    const summary = await callExternalModel(provider, context, SESSION_END_PROMPT);

    if (summary) {
      const logSizeKB = getSessionLogSizeKB(projectCwd);
      const filePath = saveSessionMemory(summary, provider.name, "session-end", logSizeKB, projectCwd);

      // Reset state for next session
      saveState({
        lastSaveTimestamp: new Date().toISOString(),
        lastSaveLogSizeKB: 0,
        saveCount: 0,
      }, projectCwd);

      // Clear session log (rotate for next session)
      clearSessionLog(projectCwd);

      console.error(`[context-memory] Session-end saved: ${filePath}`);

      return {
        decision: "approve",
        message: `Session memory saved via ${provider.name} (${provider.model})`,
      };
    }
  } catch (error) {
    console.error("[context-memory] Session-end error:", error);
  }

  // Clear session log even on failure
  clearSessionLog(projectCwd);
  return { decision: "approve" };
}

// ---- Main entry point ----

async function main() {
  let inputData = "";
  try {
    inputData = readFileSync(0, "utf-8");
  } catch {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  if (!inputData.trim()) {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  let input: HookInput;
  try {
    input = JSON.parse(inputData);
  } catch {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Detect which hook event triggered this
  // Stop event has `reason` field; PostToolUse has `tool`/`tool_name`
  const isStopEvent = input.reason !== undefined || input.hook_event_name === "Stop";

  let response: HookResponse;
  if (isStopEvent) {
    response = await handleStop(input);
  } else {
    response = await handlePostToolUse(input);
  }

  console.log(JSON.stringify(response));
}

main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
