/**
 * Shared AI operations utilities for memory compact/clear/summarize.
 *
 * Pure functions with no transport dependencies — used by both
 * MCP (src/mcp/memory/ai-ops.ts) and Proxy (src/proxy/control/memory/ai-ops.ts).
 */

// ─── AI Response Parsing ──────────────────────────────────────────

/**
 * Extract the first JSON object from an AI response string.
 * AI models often wrap JSON in markdown fences or explanatory text.
 */
export function parseAIJsonResult<T = unknown>(content: string): T | null {
	const match = content.match(/\{[\s\S]*\}/);
	if (!match) return null;
	try {
		return JSON.parse(match[0]) as T;
	} catch {
		return null;
	}
}

// ─── Content Merge Utilities ──────────────────────────────────────

/**
 * Merge multiple memories into a single content string.
 * Strips leading ## headings that duplicate the title, then joins with section separators.
 */
export function mergeMemoryContent(
	memories: Array<{ title: string; content: string }>,
): string {
	return memories
		.map((m) => {
			let content = m.content;
			// Strip leading ## heading that duplicates the title
			if (content.match(/^##\s+.+\n/)) {
				content = content.replace(/^##\s+.+\n+/, '');
			}
			return `### ${m.title}\n\n${content.trim()}`;
		})
		.join('\n\n---\n\n');
}

/**
 * Flatten and deduplicate tags from multiple sources.
 * Optionally filters out boilerplate tags (auto-capture, session-end, etc.).
 */
export function deduplicateTags(
	tagArrays: string[][],
	boilerplate?: Set<string>,
): string[] {
	const seen = new Set<string>();
	for (const tags of tagArrays) {
		for (const t of tags) {
			const tag = t.trim();
			if (tag && (!boilerplate || !boilerplate.has(tag))) {
				seen.add(tag);
			}
		}
	}
	return [...seen];
}

/** Standard boilerplate tags to filter during compaction */
export const BOILERPLATE_TAGS = new Set([
	'auto-capture',
	'session-end',
	'context-threshold',
]);

/**
 * Pick the latest non-null ISO date string from a list.
 * Falls back to current time if all are empty.
 */
export function resolveLatestDate(dates: (string | undefined)[]): string {
	return (
		dates
			.filter((d): d is string => !!d)
			.sort()
			.pop() ?? new Date().toISOString()
	);
}

// ─── Prompt Builders ──────────────────────────────────────────────

export interface MemorySummaryEntry {
	id: string;
	title: string;
	type?: string;
	tags?: string[];
	createdAt?: string;
	updatedAt?: string;
	preview?: string;
	content?: string;
	scope?: string;
	created?: string;
}

/**
 * Build the AI prompt for compact analyze phase.
 */
export function buildCompactAnalyzePrompt(
	memorySummaries: MemorySummaryEntry[],
	typeFilter: string,
): string {
	const typeLabel = typeFilter === 'all' ? '' : `${typeFilter} `;
	return `You are a memory organization assistant. Analyze these ${typeLabel}memories and suggest groups that can be merged together.

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
}

/**
 * Build the AI prompt for clear analyze phase.
 */
export function buildClearAnalyzePrompt(
	memorySummaries: MemorySummaryEntry[],
): string {
	return `You are a memory cleanup assistant. Analyze these memories and identify ones that should be deleted because they are outdated, redundant, or no longer useful.

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
}

/**
 * Build the AI prompt for summarize analyze phase.
 * Supports both standard timeline and narrative modes.
 */
export function buildSummarizeAnalyzePrompt(
	memoryDetails: MemorySummaryEntry[],
	dateRangeLabel: string,
	allOriginalTags: Set<string>,
	narrative?: boolean,
): string {
	const tagList = [...allOriginalTags].join(', ') || '(none)';

	if (narrative) {
		return `You are creating a daily session narrative. Merge these session summaries from ${dateRangeLabel} into ONE chronological story.

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
Include all important keywords from the sessions: ${tagList}

## Output format (JSON only):
{
  "title": "Daily Narrative: ${dateRangeLabel.split(' to ')[0]}",
  "summary": "## Daily Narrative: ...\\n\\n### Session Flow\\n...",
  "tags": ["keyword1", "keyword2", ...],
  "memoriesIncluded": <count>
}`;
	}

	return `You are a memory summarization assistant. Create a consolidated timeline summary of these memories.

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
1. ALL tags from the original memories: ${tagList}
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
}

/**
 * Build the AI prompt for daily narrative consolidation.
 */
export function buildDailyNarrativePrompt(
	date: string,
	entries: Array<{ title: string; content: string; created?: string }>,
): string {
	return `You are a technical session historian. Generate a comprehensive daily narrative for ${date} from these ${entries.length} session memories. Preserve ALL important details including:
- Decisions made and their rationale
- Bugs found and how they were fixed
- Architecture/design choices
- Key code changes and files modified
- Patterns discovered or gotchas encountered

Write as a structured markdown narrative:

## Daily Narrative: ${date}

### Session Flow
[Chronological story of what happened across all sessions]

### Key Decisions
[Important decisions with rationale]

### Technical Details
[Specific bugs, fixes, patterns, file changes worth remembering]

### Accomplishments
[What was achieved]

Here are the full session contents:

${entries
	.map((e) => `=== Session: ${e.title} (${e.created ?? 'unknown'}) ===\n${e.content}`)
	.join('\n\n')}`;
}
