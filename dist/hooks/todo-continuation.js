#!/usr/bin/env node

// src/hooks/stop/todo-continuation.ts
import { readFileSync } from "node:fs";
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
  let stopInput;
  try {
    stopInput = JSON.parse(inputData);
  } catch {
    const response2 = { decision: "approve" };
    console.log(JSON.stringify(response2));
    return;
  }
  const todos = stopInput.todos || [];
  const incompleteTodos = todos.filter((t) => t.status === "pending" || t.status === "in_progress");
  if (incompleteTodos.length > 0) {
    const inProgress = incompleteTodos.filter((t) => t.status === "in_progress");
    const pending = incompleteTodos.filter((t) => t.status === "pending");
    let message = `⚠️ **Incomplete Tasks Detected**

`;
    if (inProgress.length > 0) {
      message += `**In Progress:**
`;
      for (const todo of inProgress) {
        message += `- \uD83D\uDD04 ${todo.content}
`;
      }
      message += `
`;
    }
    if (pending.length > 0) {
      message += `**Pending:**
`;
      for (const todo of pending) {
        message += `- ⏳ ${todo.content}
`;
      }
      message += `
`;
    }
    message += `To continue with these tasks, start a new session and say:
` + '"Continue with the remaining tasks" or "Resume the todo list"';
    const response2 = {
      decision: "approve",
      message
    };
    console.log(JSON.stringify(response2));
    return;
  }
  const response = { decision: "approve" };
  console.log(JSON.stringify(response));
}
main().catch((error) => {
  console.error("Todo continuation hook error:", error);
  console.log(JSON.stringify({ decision: "approve" }));
});
