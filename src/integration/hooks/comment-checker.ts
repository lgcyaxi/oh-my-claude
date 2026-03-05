#!/usr/bin/env node
/**
 * Comment Checker Hook (PreToolUse)
 *
 * Checks if code edits contain excessive comments and blocks if needed.
 * Claude Code hooks receive JSON on stdin with the tool call details.
 *
 * Usage in settings.json:
 * {
 *   "hooks": {
 *     "PreToolUse": [{
 *       "matcher": "Edit|Write",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "node ~/.claude/oh-my-claude/hooks/comment-checker.js"
 *       }]
 *     }]
 *   }
 * }
 */

import { readFileSync } from "node:fs";

interface ToolInput {
  tool: string;
  input: {
    file_path?: string;
    content?: string;
    new_string?: string;
  };
}

interface HookResponse {
  decision: "approve" | "block";
  reason?: string;
}

// Comment patterns to check
const COMMENT_PATTERNS = [
  // Excessive inline comments
  /\/\/\s*TODO:/gi,
  /\/\/\s*FIXME:/gi,
  /\/\/\s*NOTE:/gi,
  /\/\/\s*HACK:/gi,
  // AI slop comments
  /\/\/\s*This (function|method|class|code)/gi,
  /\/\/\s*Here we/gi,
  /\/\/\s*The following/gi,
  /\/\*\*?\s*@description/gi,
  // Obvious comments
  /\/\/\s*(increment|decrement|add|subtract|return|set|get)\s+(the\s+)?(\w+)/gi,
  /\/\/\s*(loop|iterate)\s+(through|over)/gi,
  /\/\/\s*declare\s+/gi,
  /\/\/\s*initialize\s+/gi,
];

// Check if content has excessive comments
function hasExcessiveComments(content: string): { excessive: boolean; issues: string[] } {
  const lines = content.split("\n");
  const issues: string[] = [];

  let commentCount = 0;
  let codeLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // Count comment lines
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      commentCount++;
    } else {
      codeLines++;
    }

    // Check for problematic patterns
    for (const pattern of COMMENT_PATTERNS) {
      if (pattern.test(line)) {
        issues.push(`Found problematic comment: ${line.trim().substring(0, 50)}`);
      }
    }
  }

  // Check comment ratio (more than 30% comments is suspicious)
  const totalLines = commentCount + codeLines;
  const commentRatio = totalLines > 0 ? commentCount / totalLines : 0;

  if (commentRatio > 0.3 && commentCount > 5) {
    issues.push(`High comment ratio: ${Math.round(commentRatio * 100)}% comments`);
  }

  return {
    excessive: issues.length > 0,
    issues,
  };
}

async function main() {
  // Read input from stdin
  let inputData = "";

  try {
    inputData = readFileSync(0, "utf-8"); // Read from stdin (fd 0)
  } catch {
    // No input or error reading
    const response: HookResponse = { decision: "approve" };
    console.log(JSON.stringify(response));
    return;
  }

  if (!inputData.trim()) {
    const response: HookResponse = { decision: "approve" };
    console.log(JSON.stringify(response));
    return;
  }

  let toolInput: ToolInput;
  try {
    toolInput = JSON.parse(inputData);
  } catch {
    const response: HookResponse = { decision: "approve" };
    console.log(JSON.stringify(response));
    return;
  }

  // Only check Edit and Write tools
  if (toolInput.tool !== "Edit" && toolInput.tool !== "Write") {
    const response: HookResponse = { decision: "approve" };
    console.log(JSON.stringify(response));
    return;
  }

  // Get the content to check
  const content = toolInput.input.content || toolInput.input.new_string || "";

  if (!content) {
    const response: HookResponse = { decision: "approve" };
    console.log(JSON.stringify(response));
    return;
  }

  // Check for excessive comments
  const { excessive, issues } = hasExcessiveComments(content);

  if (excessive) {
    const response: HookResponse = {
      decision: "block",
      reason: `Code contains excessive or problematic comments:\n${issues.join("\n")}\n\nPlease remove unnecessary comments and keep only those that explain WHY, not WHAT.`,
    };
    console.log(JSON.stringify(response));
    return;
  }

  const response: HookResponse = { decision: "approve" };
  console.log(JSON.stringify(response));
}

main().catch((error) => {
  console.error("Comment checker error:", error);
  // On error, approve to not block workflow
  console.log(JSON.stringify({ decision: "approve" }));
});
