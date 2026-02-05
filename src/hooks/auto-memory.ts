#!/usr/bin/env node
/**
 * Auto-Memory Hook (Stop)
 *
 * Automatically captures session learnings at session end using a cheap
 * external model (MiniMax → DeepSeek → ZhiPu). Saves OAuth tokens by
 * offloading summarization to external APIs.
 *
 * Flow:
 * 1. Session ends (Stop hook fires)
 * 2. Collects session context (todos, reason)
 * 3. Calls cheap external model to extract key learnings
 * 4. Stores result as a session memory file
 *
 * Usage in settings.json:
 * {
 *   "hooks": {
 *     "Stop": [{
 *       "matcher": ".*",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "node ~/.claude/oh-my-claude/hooks/auto-memory.js"
 *       }]
 *     }]
 *   }
 * }
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface StopInput {
  reason: string;
  conversation_id?: string;
  transcript?: string;
  todos?: Array<{
    content: string;
    status: "pending" | "in_progress" | "completed";
  }>;
}

interface HookResponse {
  decision: "approve" | "block";
  reason?: string;
  message?: string;
}

// Provider priority order (cheapest first)
const PROVIDER_PRIORITY = [
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
  {
    name: "zhipu",
    model: "glm-4.7",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    apiKeyEnv: "ZHIPU_API_KEY",
  },
];

const SUMMARIZE_PROMPT = `You are a session summarizer. Given a coding session's context, extract the KEY LEARNINGS that would be useful for future sessions.

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

/**
 * Find the first available provider with an API key set
 */
function findAvailableProvider(): (typeof PROVIDER_PRIORITY)[number] | null {
  for (const provider of PROVIDER_PRIORITY) {
    const apiKey = process.env[provider.apiKeyEnv];
    if (apiKey && apiKey.length > 0) {
      return provider;
    }
  }
  return null;
}

/**
 * Call the external model to summarize session context
 */
async function callExternalModel(
  provider: (typeof PROVIDER_PRIORITY)[number],
  sessionContext: string
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
            content: `${SUMMARIZE_PROMPT}\n\n---\n\nSession context:\n${sessionContext}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[auto-memory] Provider ${provider.name} returned ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textBlock = data.content?.find((b) => b.type === "text");
    return textBlock?.text ?? null;
  } catch (error) {
    console.error(`[auto-memory] Failed to call ${provider.name}:`, error);
    return null;
  }
}

/**
 * Read session observation log (produced by session-logger hook)
 */
function readSessionLog(): string {
  const logPath = join(homedir(), ".claude", "oh-my-claude", "memory", "sessions", "active-session.jsonl");
  try {
    if (!existsSync(logPath)) return "";
    const raw = readFileSync(logPath, "utf-8").trim();
    if (!raw) return "";

    // Parse JSONL and format as readable timeline
    const lines = raw.split("\n").filter(Boolean);
    const observations: string[] = [];

    for (const line of lines) {
      try {
        const obs = JSON.parse(line) as { ts: string; tool: string; summary: string };
        const time = obs.ts.slice(11, 19); // HH:mm:ss
        observations.push(`  [${time}] ${obs.tool}: ${obs.summary}`);
      } catch {
        // Skip malformed lines
      }
    }

    return observations.join("\n");
  } catch {
    return "";
  }
}

/**
 * Clear session log after processing
 */
function clearSessionLog(): void {
  const logPath = join(homedir(), ".claude", "oh-my-claude", "memory", "sessions", "active-session.jsonl");
  try {
    if (existsSync(logPath)) {
      writeFileSync(logPath, "", "utf-8");
    }
  } catch {
    // Ignore
  }
}

/**
 * Build session context string from Stop hook input + session log
 */
function buildSessionContext(input: StopInput): string {
  const parts: string[] = [];

  parts.push(`Session end reason: ${input.reason}`);

  if (input.todos && input.todos.length > 0) {
    parts.push("\nTask list:");
    for (const todo of input.todos) {
      const icon =
        todo.status === "completed" ? "✓" : todo.status === "in_progress" ? "→" : "○";
      parts.push(`  ${icon} [${todo.status}] ${todo.content}`);
    }
  }

  // Read session observation log (from session-logger hook)
  const sessionLog = readSessionLog();
  if (sessionLog) {
    // Truncate to last ~6000 chars to keep API call reasonable
    const maxLen = 6000;
    const trimmed = sessionLog.length > maxLen
      ? "...\n" + sessionLog.slice(-maxLen)
      : sessionLog;
    parts.push(`\nTool usage timeline:\n${trimmed}`);
  }

  // Read the conversation transcript if available
  if (input.transcript) {
    const maxLen = 4000;
    const transcript =
      input.transcript.length > maxLen
        ? "..." + input.transcript.slice(-maxLen)
        : input.transcript;
    parts.push(`\nRecent conversation:\n${transcript}`);
  }

  return parts.join("\n");
}

/**
 * Save memory as a markdown file with YAML frontmatter
 */
function saveSessionMemory(summary: string, providerUsed: string): void {
  const memoryDir = join(homedir(), ".claude", "oh-my-claude", "memory", "sessions");
  mkdirSync(memoryDir, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, ""); // HHmmss
  const id = `session-${dateStr}-${timeStr}`;

  const frontmatter = [
    "---",
    `title: "Session summary ${dateStr}"`,
    `type: session`,
    `tags: [auto-capture, ${providerUsed}]`,
    `createdAt: "${now.toISOString()}"`,
    `updatedAt: "${now.toISOString()}"`,
    "---",
  ].join("\n");

  const content = `${frontmatter}\n\n${summary}\n`;
  const filePath = join(memoryDir, `${id}.md`);

  writeFileSync(filePath, content, "utf-8");
  console.error(`[auto-memory] Saved session memory: ${filePath}`);
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

  let input: StopInput;
  try {
    input = JSON.parse(inputData);
  } catch {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Find an available external provider
  const provider = findAvailableProvider();
  if (!provider) {
    // No external provider configured — skip auto-memory silently
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Only run for meaningful sessions (has todos, transcript, or session log)
  const hasTodos = input.todos && input.todos.length > 0;
  const hasTranscript = input.transcript && input.transcript.length > 100;
  const sessionLog = readSessionLog();
  const hasSessionLog = sessionLog.length > 100;

  if (!hasTodos && !hasTranscript && !hasSessionLog) {
    console.log(JSON.stringify({ decision: "approve" }));
    return;
  }

  // Build context and call external model
  const context = buildSessionContext(input);

  try {
    const summary = await callExternalModel(provider, context);

    if (summary) {
      saveSessionMemory(summary, provider.name);
      clearSessionLog(); // Rotate the session log after processing

      const response: HookResponse = {
        decision: "approve",
        message: `📝 Session memory auto-saved via ${provider.name} (${provider.model})`,
      };
      console.log(JSON.stringify(response));
      return;
    }
  } catch (error) {
    console.error("[auto-memory] Error:", error);
  }

  console.log(JSON.stringify({ decision: "approve" }));
}

main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
