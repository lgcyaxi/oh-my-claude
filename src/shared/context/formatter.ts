/**
 * Context Formatter
 *
 * Formats gathered context for inclusion in agent prompts.
 */

import type { GatheredContext } from "./types";

export function formatContextForPrompt(context: GatheredContext): string {
  if (context.items.length === 0) {
    return "";
  }

  const sections = context.items.map((item) => item.content);

  let formatted = `
<project_context>
${sections.join("\n\n")}
</project_context>
`;

  if (context.truncated) {
    formatted +=
      "\n<!-- Note: Some context was truncated due to token limits -->\n";
  }

  return formatted;
}

export function formatMinimalContext(context: GatheredContext): string {
  // Compact format for token-sensitive scenarios
  return context.items.map((item) => `[${item.type}]: ${item.source}`).join("\n");
}
