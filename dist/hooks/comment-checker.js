#!/usr/bin/env node

// src/hooks/pre-tool-use/comment-checker.ts
import { readFileSync } from "node:fs";
var COMMENT_PATTERNS = [
  /\/\/\s*TODO:/i,
  /\/\/\s*FIXME:/i,
  /\/\/\s*NOTE:/i,
  /\/\/\s*HACK:/i,
  /\/\/\s*This (function|method|class|code)/i,
  /\/\/\s*Here we/i,
  /\/\/\s*The following/i,
  /\/\*\*?\s*@description/i,
  /\/\/\s*(increment|decrement|add|subtract|return|set|get)\s+(the\s+)?(\w+)/i,
  /\/\/\s*(loop|iterate)\s+(through|over)/i,
  /\/\/\s*declare\s+/i,
  /\/\/\s*initialize\s+/i
];
function hasExcessiveComments(content) {
  const lines = content.split(`
`);
  const issues = [];
  let commentCount = 0;
  let codeLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0)
      continue;
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      commentCount++;
    } else {
      codeLines++;
    }
    for (const pattern of COMMENT_PATTERNS) {
      if (pattern.test(line)) {
        issues.push(`Found problematic comment: ${line.trim().substring(0, 50)}`);
      }
    }
  }
  const totalLines = commentCount + codeLines;
  const commentRatio = totalLines > 0 ? commentCount / totalLines : 0;
  if (commentRatio > 0.3 && commentCount > 5) {
    issues.push(`High comment ratio: ${Math.round(commentRatio * 100)}% comments`);
  }
  return {
    excessive: issues.length > 0,
    issues
  };
}
async function main() {
  let inputData = "";
  try {
    inputData = readFileSync(0, "utf-8");
  } catch {
    const response2 = { decision: "approve" };
    console.log(JSON.stringify(response2));
    return;
  }
  if (!inputData.trim()) {
    const response2 = { decision: "approve" };
    console.log(JSON.stringify(response2));
    return;
  }
  let toolInput;
  try {
    toolInput = JSON.parse(inputData);
  } catch {
    const response2 = { decision: "approve" };
    console.log(JSON.stringify(response2));
    return;
  }
  if (toolInput.tool !== "Edit" && toolInput.tool !== "Write") {
    const response2 = { decision: "approve" };
    console.log(JSON.stringify(response2));
    return;
  }
  const content = toolInput.input.content || toolInput.input.new_string || "";
  if (!content) {
    const response2 = { decision: "approve" };
    console.log(JSON.stringify(response2));
    return;
  }
  const { excessive, issues } = hasExcessiveComments(content);
  if (excessive) {
    const response2 = {
      decision: "block",
      reason: `Code contains excessive or problematic comments:
${issues.join(`
`)}

Please remove unnecessary comments and keep only those that explain WHY, not WHAT.`
    };
    console.log(JSON.stringify(response2));
    return;
  }
  const response = { decision: "approve" };
  console.log(JSON.stringify(response));
}
main().catch((error) => {
  console.error("Comment checker error:", error);
  console.log(JSON.stringify({ decision: "approve" }));
});
