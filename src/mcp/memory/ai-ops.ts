import type { ToolContext, CallToolResult } from "../shared/types";
import {
  createMemory,
  getMemory,
  deleteMemory,
  listMemories,
  getDefaultWriteScope,
} from "../../memory";
import type { MemoryScope } from "../../memory";
import { loadConfig, isProviderConfigured } from "../../shared/config";
import { routeByModel } from "../../shared/providers/router";
import { parseStringArray, getConfiguredWriteScope } from "../shared/utils";
import { indexNewMemory, removeFromIndex, afterMemoryMutation } from "./helpers";

export async function handleMemoryAiOp(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  cachedProjectRoot: string | undefined
): Promise<CallToolResult | undefined> {
  switch (name) {
    case "compact_memories": {
      const { mode, scope, groups, targetScope, type } = args as {
        mode: "analyze" | "execute";
        scope?: MemoryScope;
        groups?: Array<{ ids: string[]; title: string }>;
        targetScope?: "project" | "global";
        type?: "note" | "session" | "all";  // Filter by memory type (default: "note")
      };

      // Default to notes only for compact (use /omc-mem-daily for sessions)
      const typeFilter = type ?? "note";

      if (mode === "analyze") {
        // Get memories to analyze, filtered by type
        const allEntries = listMemories({ scope: scope ?? "all" }, cachedProjectRoot);
        const entries = typeFilter === "all"
          ? allEntries
          : allEntries.filter(e => e.type === typeFilter);

        if (entries.length < 2) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                analyzed: true,
                groups: [],
                message: `Not enough ${typeFilter === "all" ? "" : typeFilter + " "}memories to compact (need at least 2)`,
                typeFilter,
              }),
            }],
          };
        }

        // Prepare memory summaries for AI analysis
        const memorySummaries = entries.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          tags: e.tags,
          preview: e.content.slice(0, 300),
          scope: (e as any)._scope,
        }));

        const analysisPrompt = `You are a memory organization assistant. Analyze these ${typeFilter === "all" ? "" : typeFilter + " "}memories and suggest groups that can be merged together.

## Memories to analyze:
${JSON.stringify(memorySummaries, null, 2)}

## Task:
1. Find memories that cover the same topic, are duplicates, or are closely related
2. Group them for merging (each group should have 2+ memories)
3. Suggest a title for each merged memory

## Rules:
- Only group memories that are truly related
- Keep distinct topics separate
- Prefer quality over quantity of groups

## Output format (JSON only, no explanation):
{
  "groups": [
    {
      "ids": ["memory-id-1", "memory-id-2"],
      "title": "Suggested merged title",
      "reason": "Brief reason for grouping"
    }
  ],
  "ungrouped": ["memory-ids-that-should-stay-separate"]
}`;

        // Try providers in order: zhipu -> minimax -> deepseek
        const providerOrder = ["zhipu", "minimax", "deepseek"];
        const modelMap: Record<string, string> = {
          zhipu: "glm-5",
          minimax: "MiniMax-M2.5",
          deepseek: "deepseek-chat",
        };

        let analysisResult: any = null;
        let usedProvider: string | null = null;

        for (const provider of providerOrder) {
          try {
            const model = modelMap[provider];
            if (!model || !isProviderConfigured(loadConfig(), provider)) {
              continue;
            }

            const response = await routeByModel(
              provider,
              model,
              [{ role: "user", content: analysisPrompt }],
              { temperature: 0.1 }
            );

            const responseText = response.choices[0]?.message?.content ?? "";
            // Extract JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysisResult = JSON.parse(jsonMatch[0]);
              usedProvider = provider;
              break;
            }
          } catch (error) {
            // Try next provider
            continue;
          }
        }

        if (!analysisResult) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                analyzed: false,
                error: "Failed to analyze memories. No AI provider available.",
              }),
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              analyzed: true,
              provider: usedProvider,
              totalMemories: entries.length,
              suggestedGroups: analysisResult.groups || [],
              ungrouped: analysisResult.ungrouped || [],
              message: "Review the suggested groups and call compact_memories with mode='execute' to merge.",
            }),
          }],
        };
      } else if (mode === "execute") {
        // Execute the merge for confirmed groups
        if (!groups || groups.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                executed: false,
                error: "No groups provided. Use mode='analyze' first to get suggestions.",
              }),
            }],
            isError: true,
          };
        }

        const { indexer } = await ctx.ensureIndexer();

        const results: Array<{
          group: string;
          success: boolean;
          newId?: string;
          error?: string;
        }> = [];

        for (const group of groups) {
          try {
            // Fetch all memories in the group
            const memories = group.ids
              .map((id) => getMemory(id, "all", cachedProjectRoot))
              .filter((r) => r.success && r.data)
              .map((r) => r.data!);

            if (memories.length < 2) {
              results.push({
                group: group.title,
                success: false,
                error: "Not enough valid memories in group",
              });
              continue;
            }

            // Merge content — strip duplicate title headings from each memory
            const mergedContent = memories
              .map((m) => {
                let content = m.content;
                // If the content starts with a ## heading that matches (or is similar to) the memory title,
                // strip it to avoid duplication since we add our own section heading
                const headingMatch = content.match(/^##\s+(.+)\n/);
                if (headingMatch) {
                  // Strip the first heading — we'll add a clean one
                  content = content.replace(/^##\s+.+\n+/, "");
                }
                return `### ${m.title}\n\n${content.trim()}`;
              })
              .join("\n\n---\n\n");

            // Merge tags (unique)
            const mergedTags = [...new Set(memories.flatMap((m) => m.tags))];

            // Use the latest createdAt from the group (preserve original date context)
            const latestCreatedAt = memories
              .map((m) => m.createdAt)
              .filter(Boolean)
              .sort()
              .pop() || new Date().toISOString();

            // Create new merged memory
            const createResult = createMemory({
              title: group.title,
              content: mergedContent,
              tags: mergedTags,
              type: "note",
              createdAt: latestCreatedAt,
              scope: targetScope ?? getDefaultWriteScope(cachedProjectRoot, getConfiguredWriteScope()),
            }, cachedProjectRoot);

            if (!createResult.success) {
              results.push({
                group: group.title,
                success: false,
                error: createResult.error,
              });
              continue;
            }

            // Index the new merged file
            await indexNewMemory(
              { id: createResult.data!.id, type: "note" },
              targetScope ?? getDefaultWriteScope(cachedProjectRoot, getConfiguredWriteScope()),
              cachedProjectRoot,
              indexer,
            );

            // Delete original memories and remove from index
            for (const memory of memories) {
              deleteMemory(memory.id, "all", cachedProjectRoot);
              removeFromIndex(memory.id, cachedProjectRoot, indexer);
            }

            results.push({
              group: group.title,
              success: true,
              newId: createResult.data!.id,
            });
          } catch (error) {
            results.push({
              group: group.title,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Regenerate timeline after compact
        afterMemoryMutation(cachedProjectRoot);

        const successful = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              executed: true,
              successful,
              failed,
              results,
              message: `Compacted ${successful} group(s)${failed > 0 ? `, ${failed} failed` : ""}`,
            }),
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Invalid mode. Use 'analyze' or 'execute'.",
          }),
        }],
        isError: true,
      };
    }

    case "clear_memories": {
      const { mode, scope, ids } = args as {
        mode: "analyze" | "execute";
        scope?: MemoryScope;
        ids?: string[];
      };

      // Parse ids properly - MCP sometimes passes arrays as JSON strings
      const parsedIds = parseStringArray(ids);

      if (mode === "analyze") {
        const entries = listMemories({ scope: scope ?? "all" }, cachedProjectRoot);

        if (entries.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                analyzed: true,
                candidates: [],
                message: "No memories found to analyze.",
              }),
            }],
          };
        }

        // Prepare memory summaries for AI analysis
        const memorySummaries = entries.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          tags: e.tags,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          preview: e.content.slice(0, 300),
          scope: (e as any)._scope,
        }));

        const analysisPrompt = `You are a memory cleanup assistant. Analyze these memories and identify ones that should be deleted because they are outdated, redundant, or no longer useful.

## Memories to analyze:
${JSON.stringify(memorySummaries, null, 2)}

## Task:
1. Identify memories that are outdated (old session logs, stale context)
2. Identify memories that are redundant (duplicates, superseded by newer info)
3. Identify memories that are trivial or no longer useful
4. Provide a clear reason for each deletion candidate

## Rules:
- Be conservative — only suggest deletion for clearly unneeded memories
- Session memories older than 14 days are good candidates
- Keep architectural decisions, conventions, and important patterns
- Keep memories that document bugs, fixes, or lessons learned
- If unsure, do NOT suggest deletion

## Output format (JSON only, no explanation):
{
  "candidates": [
    {
      "id": "memory-id",
      "title": "Memory Title",
      "reason": "Why this should be deleted",
      "confidence": "high" | "medium"
    }
  ],
  "keep": [
    {
      "id": "memory-id",
      "title": "Memory Title",
      "reason": "Why this should be kept"
    }
  ]
}`;

        // Try providers in order: zhipu -> minimax -> deepseek
        const providerOrder = ["zhipu", "minimax", "deepseek"];
        const modelMap: Record<string, string> = {
          zhipu: "glm-5",
          minimax: "MiniMax-M2.5",
          deepseek: "deepseek-chat",
        };

        let analysisResult: any = null;
        let usedProvider: string | null = null;

        for (const provider of providerOrder) {
          try {
            const model = modelMap[provider];
            if (!model || !isProviderConfigured(loadConfig(), provider)) {
              continue;
            }

            const response = await routeByModel(
              provider,
              model,
              [{ role: "user", content: analysisPrompt }],
              { temperature: 0.1 }
            );

            const responseText = response.choices[0]?.message?.content ?? "";
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysisResult = JSON.parse(jsonMatch[0]);
              usedProvider = provider;
              break;
            }
          } catch {
            continue;
          }
        }

        if (!analysisResult) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                analyzed: false,
                error: "Failed to analyze memories. No AI provider available.",
              }),
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              analyzed: true,
              provider: usedProvider,
              totalMemories: entries.length,
              candidates: analysisResult.candidates || [],
              keep: analysisResult.keep || [],
              message: "Review the deletion candidates and call clear_memories with mode='execute' and ids=[...] to delete.",
            }),
          }],
        };
      } else if (mode === "execute") {
        if (!ids || ids.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                executed: false,
                error: "No IDs provided. Use mode='analyze' first to get candidates.",
              }),
            }],
            isError: true,
          };
        }

        // Clean up index if available
        const { indexer } = await ctx.ensureIndexer();

        const results: Array<{
          id: string;
          success: boolean;
          title?: string;
          error?: string;
        }> = [];

        for (const id of parsedIds) {
          try {
            // Get memory info before deletion for reporting
            const memResult = getMemory(id, "all", cachedProjectRoot);
            const title = memResult.data?.title ?? id;
            const createdAt = memResult.data?.createdAt ?? new Date().toISOString();
            const type = memResult.data?.type ?? "note";
            const memScope = (memResult.data as any)?._scope ?? "project";

            const deleteResult = deleteMemory(id, "all", cachedProjectRoot);
            if (deleteResult.success) {
              // Save cleared entry for Timeline (preserves "what was done" without content/tags)
              try {
                const { saveClearedEntry } = await import("../../memory/timeline");
                saveClearedEntry({
                  id,
                  title,
                  createdAt,
                  clearedAt: new Date().toISOString(),
                  type: type as "note" | "session",
                }, memScope as "project" | "global", cachedProjectRoot);
              } catch {
                // Timeline recording is best-effort
              }

              // Clean index entry
              removeFromIndex(id, cachedProjectRoot, indexer);
              results.push({ id, success: true, title });
            } else {
              results.push({ id, success: false, title, error: deleteResult.error });
            }
          } catch (error) {
            results.push({
              id,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Regenerate timeline after clear
        afterMemoryMutation(cachedProjectRoot);

        const deleted = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              executed: true,
              deleted,
              failed,
              results,
              message: `Cleared ${deleted} memory(s)${failed > 0 ? `, ${failed} failed` : ""}`,
            }),
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Invalid mode. Use 'analyze' or 'execute'.",
          }),
        }],
        isError: true,
      };
    }

    case "summarize_memories": {
      const { mode, days, after, before, scope, summary, title, tags: executeTags, archiveOriginals, originalIds, targetScope, type, narrative, dateRange, outputType, createdAt: explicitCreatedAt } = args as {
        mode: "analyze" | "execute";
        days?: number;
        after?: string;
        before?: string;
        scope?: MemoryScope;
        summary?: string;
        title?: string;
        tags?: string[];
        archiveOriginals?: boolean;
        originalIds?: string[];
        targetScope?: "project" | "global";
        type?: "note" | "session" | "all";  // Filter by memory type
        narrative?: boolean;  // Use narrative format for daily consolidation
        dateRange?: { start: string; end: string };  // Specific date range for daily narrative
        outputType?: "note" | "session";  // Memory type for the saved summary
        createdAt?: string;  // Override date used in memory ID
      };

      // Parse originalIds properly - MCP sometimes passes arrays as JSON strings
      const parsedOriginalIds = parseStringArray(originalIds);

      if (mode === "analyze") {
        // Calculate date range
        const now = new Date();
        let endDate: string;
        let startDate: string;

        // Support specific date range for daily narrative mode
        if (dateRange) {
          startDate = dateRange.start;
          endDate = dateRange.end;
        } else if (after) {
          startDate = after;
          endDate = before ?? now.toISOString();
        } else {
          const daysBack = days ?? 7;
          const start = new Date(now);
          start.setDate(start.getDate() - daysBack);
          startDate = start.toISOString();
          endDate = before ?? now.toISOString();
        }

        const allEntries = listMemories({
          scope: scope ?? "all",
          after: startDate,
          before: endDate,
        }, cachedProjectRoot);

        // Filter by type if specified
        const typeFilter = type ?? "all";
        const entries = typeFilter === "all"
          ? allEntries
          : allEntries.filter(e => e.type === typeFilter);

        if (entries.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                analyzed: true,
                summary: null,
                message: `No ${typeFilter === "all" ? "" : typeFilter + " "}memories found in the specified date range (${startDate.slice(0, 10)} to ${endDate.slice(0, 10)}).`,
                typeFilter,
              }),
            }],
          };
        }

        // Prepare full memories for AI summarization
        const memoryDetails = entries.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          tags: e.tags,
          createdAt: e.createdAt,
          content: e.content.slice(0, 1000),
          scope: (e as any)._scope,
        }));

        const dateRangeLabel = `${startDate.slice(0, 10)} to ${endDate.slice(0, 10)}`;
        // Collect all existing tags from original memories for keyword aggregation
        const allOriginalTags = new Set<string>();
        for (const m of memoryDetails) {
          if (m.tags) for (const t of m.tags) allOriginalTags.add(t);
        }

        // Choose prompt based on narrative mode
        const summarizePrompt = narrative
          ? `You are creating a daily session narrative. Merge these session summaries from ${dateRangeLabel} into ONE chronological story.

## Sessions to consolidate:
${JSON.stringify(memoryDetails, null, 2)}

## Task:
Create a chronological narrative that tells the story of what happened during this day.

## Output format:
### Session Flow
Describe what happened first, then what happened next, in chronological order based on session timestamps.

### Key Accomplishments
- Bullet list of concrete achievements

### Decisions Made
- Bullet list of architectural or design decisions with rationale

### Patterns & Gotchas Discovered
- Bullet list of reusable knowledge

## Rules:
- Maintain chronological flow based on session timestamps
- Deduplicate repeated content
- Preserve specific technical details (file paths, commands, APIs)
- Remove redundant "session started" or "session ended" phrasing
- Keep it concise but actionable (400-800 words max)

## Tags (CRITICAL for retrieval):
Include all important keywords from the sessions: ${[...allOriginalTags].join(", ") || "(none)"}

## Output format (JSON only):
{
  "title": "Daily Narrative: ${dateRangeLabel.split(" to ")[0]}",
  "summary": "## Daily Narrative: ...\\n\\n### Session Flow\\n...",
  "tags": ["keyword1", "keyword2", ...],
  "memoriesIncluded": <count>
}`
          : `You are a memory summarization assistant. Create a consolidated timeline summary of these memories.

## Date Range: ${dateRangeLabel}

## Memories to summarize:
${JSON.stringify(memoryDetails, null, 2)}

## Task:
1. Create a chronological timeline of key events, decisions, and activities
2. Group related items together
3. Highlight important decisions and outcomes
4. Keep the summary concise but comprehensive

## Rules:
- Use markdown format with date-based sections
- Preserve important technical details and decisions
- Merge related session entries into coherent narratives
- The summary should stand alone — someone reading it should understand the full context

## Tags (CRITICAL for retrieval):
The tags array is the PRIMARY way this summary will be found later. You MUST include:
1. ALL tags from the original memories: ${[...allOriginalTags].join(", ") || "(none)"}
2. Key technical terms mentioned in the content (library names, tools, APIs, patterns)
3. Feature/component names discussed
4. Action types (bug-fix, refactor, architecture, config, etc.)
5. Project names and identifiers

Do NOT use generic tags like "summary" or "timeline" — those are useless for retrieval.
Aim for 8-20 specific, searchable tags.

## Output format (JSON only):
{
  "title": "Summary: <concise topic description>",
  "summary": "# Timeline Summary\\n\\n## <Date>\\n\\n- ...",
  "tags": ["keyword1", "keyword2", ...],
  "memoriesIncluded": <count>
}`;

        // Try providers in order
        const providerOrder = ["zhipu", "minimax", "deepseek"];
        const modelMap: Record<string, string> = {
          zhipu: "glm-5",
          minimax: "MiniMax-M2.5",
          deepseek: "deepseek-chat",
        };

        let summaryResult: any = null;
        let usedProvider: string | null = null;

        for (const provider of providerOrder) {
          try {
            const model = modelMap[provider];
            if (!model || !isProviderConfigured(loadConfig(), provider)) {
              continue;
            }

            const response = await routeByModel(
              provider,
              model,
              [{ role: "user", content: summarizePrompt }],
              { temperature: 0.3 }
            );

            const responseText = response.choices[0]?.message?.content ?? "";
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              summaryResult = JSON.parse(jsonMatch[0]);
              usedProvider = provider;
              break;
            }
          } catch {
            continue;
          }
        }

        if (!summaryResult) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                analyzed: false,
                error: "Failed to summarize memories. No AI provider available.",
              }),
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              analyzed: true,
              provider: usedProvider,
              dateRange: dateRangeLabel,
              memoriesIncluded: entries.length,
              originalIds: entries.map((e) => e.id),
              suggestedTitle: summaryResult.title || `Summary: ${dateRangeLabel}`,
              suggestedSummary: summaryResult.summary || "",
              suggestedTags: summaryResult.tags || [],
              message: "Review the summary preview. Call summarize_memories with mode='execute' to save it.",
            }),
          }],
        };
      } else if (mode === "execute") {
        if (!summary) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                executed: false,
                error: "No summary text provided. Use mode='analyze' first.",
              }),
            }],
            isError: true,
          };
        }

        // Create the summary memory with keyword-rich tags for retrieval
        const summaryTags = executeTags && executeTags.length > 0
          ? executeTags
          : ["summary", "timeline"];

        // Resolve createdAt: explicit param > auto-detect from title > now
        let resolvedCreatedAt = explicitCreatedAt;
        if (!resolvedCreatedAt && title) {
          // Auto-detect date from title like "Daily Narrative: 2026-02-14"
          const dateMatch = title.match(/(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) {
            resolvedCreatedAt = `${dateMatch[1]}T00:00:00.000Z`;
          }
        }

        const { indexer } = await ctx.ensureIndexer();

        const createResult = createMemory({
          title: title ?? "Timeline Summary",
          content: summary,
          tags: summaryTags,
          type: outputType ?? "note",
          scope: targetScope ?? getDefaultWriteScope(cachedProjectRoot, getConfiguredWriteScope()),
          ...(resolvedCreatedAt ? { createdAt: resolvedCreatedAt } : {}),
        }, cachedProjectRoot);

        if (!createResult.success) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                executed: false,
                error: createResult.error ?? "Failed to create summary memory",
              }),
            }],
            isError: true,
          };
        }

        // Index the new summary file
        if (createResult.data) {
          await indexNewMemory(
            { id: createResult.data.id, type: createResult.data.type },
            targetScope ?? getDefaultWriteScope(cachedProjectRoot, getConfiguredWriteScope()),
            cachedProjectRoot,
            indexer,
          );
        }

        let archivedCount = 0;
        let archiveErrors = 0;

        // Delete original memories after saving summary (default: true)
        const shouldArchive = archiveOriginals !== false;
        if (shouldArchive && parsedOriginalIds.length > 0) {
          for (const id of parsedOriginalIds) {
            try {
              const deleteResult = deleteMemory(id, "all", cachedProjectRoot);
              if (deleteResult.success) {
                removeFromIndex(id, cachedProjectRoot, indexer);
                archivedCount++;
              } else {
                archiveErrors++;
              }
            } catch {
              archiveErrors++;
            }
          }
        }

        // Regenerate timeline after summarize
        afterMemoryMutation(cachedProjectRoot);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              executed: true,
              summaryId: createResult.data!.id,
              summaryTitle: title ?? "Timeline Summary",
              tags: summaryTags,
              archived: shouldArchive ? archivedCount : 0,
              archiveErrors,
              message: `Summary saved${shouldArchive ? `. Deleted ${archivedCount} original memories` : ""}`,
            }),
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Invalid mode. Use 'analyze' or 'execute'.",
          }),
        }],
        isError: true,
      };
    }

    default:
      return undefined;
  }
}
