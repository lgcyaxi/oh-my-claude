#!/usr/bin/env node
/**
 * Context-Memory Hook (PostToolUse)
 *
 * Automatically captures session memory when session activity indicates
 * significant context usage. Uses session log file size as a proxy for
 * context consumption.
 *
 * Uses the same external model pipeline as auto-memory.ts:
 * ZhiPu -> MiniMax -> DeepSeek (configurable in oh-my-claude.json)
 *
 * Triggers on PostToolUse hook which fires after each tool call.
 * Uses session log file to estimate context growth.
 * Only saves once per threshold crossing (tracks state in temp file).
 *
 * Usage in settings.json:
 * {
 *   "hooks": {
 *     "PostToolUse": [{
 *       "matcher": ".*",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "node ~/.claude/oh-my-claude/hooks/context-memory.js"
 *       }]
 *     }]
 *   }
 * }
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface PostToolUseInput {
  tool?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: string;
  conversation_id?: string;
}

interface HookResponse {
  decision: "approve" | "block";
  reason?: string;
  message?: string;
}

// Provider priority order (user's preference: zhipu -> minimax -> deepseek)
const DEFAULT_PROVIDER_PRIORITY = [
  {
    name: "zhipu",
    model: "glm-4.7",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    apiKeyEnv: "ZHIPU_API_KEY",
  },
  {
    name: "minimax",
    model: "MiniMax-M2.1",
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

// Default: save when session log exceeds ~100KB (rough proxy for 75% context)
// Session log grows ~100-200 bytes per tool call, so 100KB ≈ 500-1000 tool calls
const DEFAULT_SESSION_LOG_THRESHOLD_KB = 100;

// State file to track if we've already saved for this session
const STATE_DIR = join(homedir(), ".claude", "oh-my-claude", "state");
const STATE_FILE = join(STATE_DIR, "context-memory-state.json");
const SESSION_LOG_PATH = join(homedir(), ".claude", "oh-my-claude", "memory", "sessions", "active-session.jsonl");

interface ContextMemoryState {
  lastSaveTimestamp: string | null;
  lastSaveLogSizeKB: number | null;
  saveCount: number;
}

const SUMMARIZE_PROMPT = `You are a session summarizer. Extract KEY LEARNINGS from this coding session that would be useful for future sessions.

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

NOTE: This is an auto-save triggered by context threshold. Focus on what's been accomplished so far.`;

/**
 * Load configuration from oh-my-claude.json
 */
function loadConfig(): { threshold: number; providerPriority: string[] } {
  const configPath = join(homedir(), ".claude", "oh-my-claude.json");
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      return {
        // If autoSaveThreshold is 0, disable this feature
        // Otherwise convert percentage to KB threshold (75% → 100KB)
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

/**
 * Get ordered providers based on config priority
 */
function getOrderedProviders(priority: string[]): typeof DEFAULT_PROVIDER_PRIORITY {
  const providerMap = new Map(DEFAULT_PROVIDER_PRIORITY.map((p) => [p.name, p]));
  const ordered: typeof DEFAULT_PROVIDER_PRIORITY = [];

  for (const name of priority) {
    const provider = providerMap.get(name);
    if (provider) {
      ordered.push(provider);
    }
  }

  // Add any remaining providers not in priority list
  for (const provider of DEFAULT_PROVIDER_PRIORITY) {
    if (!ordered.includes(provider)) {
      ordered.push(provider);
    }
  }

  return ordered;
}

/**
 * Load state
 */
function loadState(): ContextMemoryState {
  try {
    if (existsSync(STATE_FILE)) {
      const raw = readFileSync(STATE_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // Ignore
  }
  return { lastSaveTimestamp: null, lastSaveLogSizeKB: null, saveCount: 0 };
}

/**
 * Save state
 */
function saveState(state: ContextMemoryState): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // Ignore
  }
}

/**
 * Get session log file size in KB
 */
function getSessionLogSizeKB(): number {
  try {
    if (!existsSync(SESSION_LOG_PATH)) return 0;
    const stats = statSync(SESSION_LOG_PATH);
    return Math.round(stats.size / 1024);
  } catch {
    return 0;
  }
}

/**
 * Read session log content for summarization
 */
function readSessionLog(): string {
  try {
    if (!existsSync(SESSION_LOG_PATH)) return "";
    const raw = readFileSync(SESSION_LOG_PATH, "utf-8").trim();
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

    // Return last ~8000 chars
    const joined = observations.join("\n");
    return joined.length > 8000 ? "...\n" + joined.slice(-8000) : joined;
  } catch {
    return "";
  }
}

/**
 * Find the first available provider with an API key
 */
function findAvailableProvider(providers: typeof DEFAULT_PROVIDER_PRIORITY): (typeof DEFAULT_PROVIDER_PRIORITY)[number] | null {
  for (const provider of providers) {
    const apiKey = process.env[provider.apiKeyEnv];
    if (apiKey && apiKey.length > 0) {
      return provider;
    }
  }
  return null;
}

/**
 * Call external model to summarize
 */
async function callExternalModel(
  provider: (typeof DEFAULT_PROVIDER_PRIORITY)[number],
  context: string
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
            content: `${SUMMARIZE_PROMPT}\n\n---\n\nSession context:\n${context}`,
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

/**
 * Save memory as markdown file
 */
function saveSessionMemory(summary: string, providerUsed: string, logSizeKB: number): string {
  // Try project memory first, fallback to global
  let memoryDir: string;

  // Check for project root (.git)
  let projectRoot: string | null = null;
  let dir = process.cwd();
  while (dir !== "/") {
    if (existsSync(join(dir, ".git"))) {
      projectRoot = dir;
      break;
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
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
  const id = `context-save-${dateStr}-${timeStr}`;

  const frontmatter = [
    "---",
    `title: "Context checkpoint ${dateStr} (${logSizeKB}KB log)"`,
    `type: session`,
    `tags: [auto-capture, context-threshold, ${providerUsed}]`,
    `createdAt: "${now.toISOString()}"`,
    `updatedAt: "${now.toISOString()}"`,
    "---",
  ].join("\n");

  const content = `${frontmatter}\n\n${summary}\n`;
  const filePath = join(memoryDir, `${id}.md`);

  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

async function main() {
  // Read input from stdin
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

  let input: PostToolUseInput;
  try {
    input = JSON.parse(inputData);
  } catch {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Skip if this is a memory-related tool (avoid recursion)
  const toolName = input.tool || input.tool_name || "";
  if (toolName.includes("memory") || toolName.includes("context-memory")) {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Load config
  const config = loadConfig();

  // Skip if threshold is 0 (disabled)
  if (config.threshold === 0) {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Get current session log size
  const logSizeKB = getSessionLogSizeKB();

  // Skip if below threshold
  if (logSizeKB < config.threshold) {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Check if we've already saved recently
  const state = loadState();

  // Skip if we saved at similar or higher log size (with 20KB buffer)
  if (
    state.lastSaveLogSizeKB !== null &&
    logSizeKB <= state.lastSaveLogSizeKB + 20
  ) {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Find available provider
  const providers = getOrderedProviders(config.providerPriority);
  const provider = findAvailableProvider(providers);

  if (!provider) {
    // No provider available - skip silently
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Build context for summarization
  const sessionLog = readSessionLog();

  if (!sessionLog || sessionLog.length < 500) {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  const context = `Session activity log (${logSizeKB}KB, threshold: ${config.threshold}KB):\n\n${sessionLog}`;

  // Call external model
  try {
    const summary = await callExternalModel(provider, context);

    if (summary) {
      const filePath = saveSessionMemory(summary, provider.name, logSizeKB);

      // Update state
      saveState({
        lastSaveTimestamp: new Date().toISOString(),
        lastSaveLogSizeKB: logSizeKB,
        saveCount: state.saveCount + 1,
      });

      console.error(`[context-memory] Saved at ${logSizeKB}KB: ${filePath}`);

      const response: HookResponse = {
        decision: "approve",
        message: `📝 Context memory auto-saved (${logSizeKB}KB activity, via ${provider.name})`,
      };
      console.log(JSON.stringify(response));
      return;
    }
  } catch (error) {
    console.error("[context-memory] Error:", error);
  }

  console.log(JSON.stringify({ decision: "approve" }));
}

main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
