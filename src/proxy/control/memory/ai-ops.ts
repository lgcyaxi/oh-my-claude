/**
 * Memory AI operations — compact, clear, summarize, daily narrative
 */

import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { jsonResponse } from '../helpers';
import { toErrorMessage } from '../../../shared/utils';
import type { MemoryEntryWithPath } from './types';
import { parseFrontmatter } from './io';
import { collectMemoryEntries } from './query';
import { regenerateTimeline } from './timeline';

/** Call AI provider for text completion */
export async function callAI(
	controlPort: string,
	prompt: string,
	body: Record<string, unknown>,
	maxTokens = 2000,
): Promise<{ content: string; provider: string; model: string }> {
	const resp = await fetch(
		`http://localhost:${controlPort}/internal/complete`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				provider: typeof body.provider === 'string' ? body.provider : undefined,
				model: typeof body.model === 'string' ? body.model : undefined,
				max_tokens: maxTokens,
				temperature: 0.3,
				messages: [{ role: 'user', content: prompt }],
			}),
			signal: AbortSignal.timeout(180000),
		},
	);

	if (!resp.ok) {
		const err = await resp.json().catch(() => ({}));
		throw new Error(`AI failed: ${(err as { error?: string }).error ?? resp.statusText}`);
	}

	return (await resp.json()) as { content: string; provider: string; model: string };
}

/**
 * Daily operation: group session notes by date, summarize each group
 * with full detail preservation, write narrative file, delete originals.
 *
 * Accepts optional body.date (YYYY-MM-DD) to target a specific date.
 * Default: process all dates that have 2+ session-type memories.
 */
export async function handleDailyOperation(
	controlPort: string,
	body: Record<string, unknown>,
	targetProject: string | undefined,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	// Collect ALL session-type memories with FULL content
	const allEntries = await collectMemoryEntries(targetProject, true);
	const sessionEntries = allEntries.filter((e) => e.type === 'session');

	if (sessionEntries.length === 0) {
		return jsonResponse(
			{ ok: true, action: 'daily', analysis: 'No session memories found.', memoriesAnalyzed: 0 },
			200,
			corsHeaders,
		);
	}

	// Group sessions by date (YYYY-MM-DD from created field)
	const dateGroups = new Map<string, MemoryEntryWithPath[]>();
	for (const entry of sessionEntries) {
		if (!entry.created) continue;
		const date = entry.created.slice(0, 10); // YYYY-MM-DD
		if (!date || date.length !== 10) continue;
		const group = dateGroups.get(date) ?? [];
		group.push(entry);
		dateGroups.set(date, group);
	}

	// Filter to requested date, or all dates with 2+ sessions
	const targetDate = typeof body.date === 'string' ? body.date : undefined;
	const datesToProcess: string[] = [];

	if (targetDate) {
		if (dateGroups.has(targetDate)) {
			datesToProcess.push(targetDate);
		} else {
			return jsonResponse(
				{ ok: true, action: 'daily', analysis: `No session memories found for ${targetDate}.`, memoriesAnalyzed: 0 },
				200,
				corsHeaders,
			);
		}
	} else {
		// Process all dates with 2+ sessions (or 1 if explicitly requesting all)
		for (const [date, entries] of dateGroups) {
			if (entries.length >= 2) {
				datesToProcess.push(date);
			}
		}
		datesToProcess.sort(); // chronological order
	}

	if (datesToProcess.length === 0) {
		return jsonResponse(
			{
				ok: true,
				action: 'daily',
				analysis: `Found ${dateGroups.size} dates but none with 2+ sessions to consolidate.`,
				memoriesAnalyzed: sessionEntries.length,
			},
			200,
			corsHeaders,
		);
	}

	// Process each date group: AI summarize → write narrative → delete originals
	const results: Array<{
		date: string;
		sessionsConsolidated: number;
		narrativePath: string;
		deletedFiles: string[];
		error?: string;
	}> = [];

	for (const date of datesToProcess) {
		const entries = dateGroups.get(date)!;

		// Build prompt with FULL content for detail preservation
		const prompt = `You are a technical session historian. Generate a comprehensive daily narrative for ${date} from these ${entries.length} session memories. Preserve ALL important details including:
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
	.map((e) => `=== Session: ${e.title} (${e.created}) ===\n${e.content}`)
	.join('\n\n')}`;

		try {
			const result = await callAI(controlPort, prompt, body, 4000);

			// Determine where to write the narrative
			// Use the first entry's directory to keep it in the same scope
			const targetDir = entries[0]!.dir;
			await mkdir(targetDir, { recursive: true });

			// Build narrative file with frontmatter
			const narrativeId = `${date}-daily-narrative`;
			const narrativePath = join(targetDir, `${narrativeId}.md`);

			// Collect meaningful tags from all source entries (tags + concepts)
			// Filter out generic auto-capture boilerplate tags
			const boilerplateTags = new Set(['auto-capture', 'session-end', 'context-threshold']);
			const allTags = new Set<string>(['daily-narrative']);
			for (const e of entries) {
				const raw = await readFile(e.filePath, 'utf-8').catch(() => '');
				const { meta } = parseFrontmatter(raw);
				if (Array.isArray(meta.tags)) {
					for (const t of meta.tags) {
						const tag = String(t).trim();
						if (tag && !boilerplateTags.has(tag)) allTags.add(tag);
					}
				}
				// Also include concepts (the meaningful topic keywords)
				if (Array.isArray(meta.concepts)) {
					for (const c of meta.concepts) {
						const concept = String(c).trim();
						if (concept) allTags.add(concept);
					}
				}
			}

			const narrativeContent = `---
title: "Daily Narrative: ${date}"
type: session
tags: [${[...allTags].join(', ')}]
created: "${date}T00:00:00.000Z"
updated: "${new Date().toISOString()}"
---

${result.content}`;

			await writeFile(narrativePath, narrativeContent, 'utf-8');

			// Delete original session files
			const deletedFiles: string[] = [];
			for (const e of entries) {
				// Don't delete existing daily narratives (avoid deleting our own output)
				if (e.id.includes('daily-narrative')) continue;
				try {
					await unlink(e.filePath);
					deletedFiles.push(e.filePath);
				} catch {
					// File may already be gone
				}
			}

			results.push({
				date,
				sessionsConsolidated: entries.length,
				narrativePath,
				deletedFiles,
			});
		} catch (error) {
			results.push({
				date,
				sessionsConsolidated: entries.length,
				narrativePath: '',
				deletedFiles: [],
				error: toErrorMessage(error),
			});
		}
	}

	// Regenerate timelines for affected directories
	const regeneratedRoots = new Set<string>();
	for (const entry of sessionEntries) {
		// entry.dir is e.g. /project/.claude/mem/sessions — parent is the mem root
		const memRoot = join(entry.dir, '..');
		if (!regeneratedRoots.has(memRoot)) {
			regeneratedRoots.add(memRoot);
			await regenerateTimeline(memRoot).catch(() => {});
		}
	}

	// Build analysis summary
	const totalConsolidated = results.reduce((sum, r) => sum + r.sessionsConsolidated, 0);
	const totalDeleted = results.reduce((sum, r) => sum + r.deletedFiles.length, 0);
	const successCount = results.filter((r) => !r.error).length;

	const analysisParts = [
		`Daily Narrative Results`,
		`=======================`,
		`Processed: ${totalConsolidated} sessions across ${datesToProcess.length} dates`,
		`Created: ${successCount} narratives`,
		`Deleted: ${totalDeleted} original session files`,
		``,
	];

	for (const r of results) {
		if (r.error) {
			analysisParts.push(`- ${r.date}: ERROR — ${r.error}`);
		} else {
			analysisParts.push(`- ${r.date}: Consolidated ${r.sessionsConsolidated} sessions → daily narrative (deleted ${r.deletedFiles.length} originals)`);
		}
	}

	return jsonResponse(
		{
			ok: true,
			action: 'daily',
			analysis: analysisParts.join('\n'),
			memoriesAnalyzed: sessionEntries.length,
			datesProcessed: datesToProcess.length,
			results,
		},
		200,
		corsHeaders,
	);
}

/**
 * Compact: Two-phase merge of related memories.
 *   analyze → AI suggests groups of related memories
 *   execute → merge groups into consolidated notes, delete originals
 *
 * Supports `body.type` filter: "note" (default), "session", or "all".
 * Matches MCP compact_memories behavior (defaults to notes-only,
 * sessions should use /omc-mem-daily).
 */
export async function handleCompactOperation(
	controlPort: string,
	body: Record<string, unknown>,
	targetProject: string | undefined,
	mode: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const allEntries = await collectMemoryEntries(targetProject, true);

	// Filter by type — default to "note" (matching MCP compact_memories behavior)
	const typeFilter = typeof body.type === 'string' ? body.type : 'note';
	const filteredEntries = typeFilter === 'all'
		? allEntries
		: allEntries.filter((e) => e.type === typeFilter);

	if (mode === 'execute') {
		// Execute: merge confirmed groups
		const groups = body.groups as Array<{ ids: string[]; title: string }> | undefined;
		if (!groups || groups.length === 0) {
			return jsonResponse({ error: "No groups provided. Use mode='analyze' first." }, 400, corsHeaders);
		}

		const results: Array<{ title: string; merged: number; newFile: string; deleted: string[]; error?: string }> = [];

		for (const group of groups) {
			try {
				// Look up entries from the full set (execute may reference IDs from analyze)
				const entries = group.ids
					.map((id) => allEntries.find((e) => e.id === id))
					.filter((e): e is MemoryEntryWithPath => !!e);

				if (entries.length < 2) {
					results.push({ title: group.title, merged: 0, newFile: '', deleted: [], error: 'Not enough valid memories' });
					continue;
				}

				// Merge content with section headings
				const mergedContent = entries
					.map((e) => `### ${e.title}\n\n${e.content.trim()}`)
					.join('\n\n---\n\n');

				// Collect tags from all sources (filter boilerplate)
				const boilerplate = new Set(['auto-capture', 'session-end', 'context-threshold']);
				const mergedTags = new Set<string>();
				for (const e of entries) {
					const raw = await readFile(e.filePath, 'utf-8').catch(() => '');
					const { meta } = parseFrontmatter(raw);
					if (Array.isArray(meta.tags)) {
						for (const t of meta.tags) {
							const tag = String(t).trim();
							if (tag && !boilerplate.has(tag)) mergedTags.add(tag);
						}
					}
					if (Array.isArray(meta.concepts)) {
						for (const c of meta.concepts) mergedTags.add(String(c).trim());
					}
				}

				// Determine output type: if all entries are sessions → session, otherwise note
				const allSessions = entries.every((e) => e.type === 'session');
				const outputType = allSessions ? 'session' : 'note';

				// Write merged file
				const targetDir = entries[0]!.dir;
				await mkdir(targetDir, { recursive: true });
				const dateStr = new Date().toISOString().slice(0, 10);
				const slug = group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
				const newId = `${dateStr}-compact-${slug}`;
				const newPath = join(targetDir, `${newId}.md`);

				const latestCreated = entries
					.map((e) => e.created)
					.filter(Boolean)
					.sort()
					.pop() || new Date().toISOString();

				const fileContent = `---
title: "${group.title}"
type: ${outputType}
tags: [${[...mergedTags].join(', ')}]
created: "${latestCreated}"
updated: "${new Date().toISOString()}"
---

${mergedContent}`;

				await writeFile(newPath, fileContent, 'utf-8');

				// Delete originals
				const deleted: string[] = [];
				for (const e of entries) {
					try { await unlink(e.filePath); deleted.push(e.id); } catch { /* skip */ }
				}

				results.push({ title: group.title, merged: entries.length, newFile: newId, deleted });
			} catch (error) {
				results.push({ title: group.title, merged: 0, newFile: '', deleted: [], error: toErrorMessage(error) });
			}
		}

		// Regenerate timelines
		const roots = new Set<string>();
		for (const e of allEntries) { const r = join(e.dir, '..'); if (!roots.has(r)) { roots.add(r); await regenerateTimeline(r).catch(() => {}); } }

		const totalMerged = results.reduce((s, r) => s + r.merged, 0);
		const totalDeleted = results.reduce((s, r) => s + r.deleted.length, 0);

		return jsonResponse({
			ok: true, action: 'compact', mode: 'execute',
			analysis: `Compact Results\n===============\nMerged: ${totalMerged} memories into ${results.filter(r => !r.error).length} groups\nDeleted: ${totalDeleted} originals\n\n${results.map(r => r.error ? `- ${r.title}: ERROR — ${r.error}` : `- ${r.title}: Merged ${r.merged} → ${r.newFile} (deleted ${r.deleted.length})`).join('\n')}`,
			memoriesAnalyzed: filteredEntries.length, typeFilter, results,
		}, 200, corsHeaders);
	}

	// Analyze mode: AI suggests groups (only from filtered entries)
	if (filteredEntries.length < 2) {
		return jsonResponse({
			ok: true, action: 'compact', mode: 'analyze',
			analysis: `Not enough ${typeFilter === 'all' ? '' : typeFilter + ' '}memories to compact (found ${filteredEntries.length}, need at least 2).`,
			groups: [], typeFilter,
			memoriesAnalyzed: filteredEntries.length,
		}, 200, corsHeaders);
	}

	const typeLabel = typeFilter === 'all' ? '' : `${typeFilter} `;
	const prompt = `You are a memory organization assistant. Analyze these ${typeLabel}memories and suggest groups that can be merged.

## Memories:
${filteredEntries.map((e) => `- [${e.id}] "${e.title}" (${e.type}, ${e.created}): ${e.content.slice(0, 200)}`).join('\n')}

## Rules:
- Only group memories that are truly related or overlapping
- Each group needs 2+ memories
- Keep distinct topics separate

## Output format (JSON only, no markdown):
{
  "groups": [
    { "ids": ["id1", "id2"], "title": "Merged title", "reason": "Why these belong together" }
  ]
}`;

	try {
		const result = await callAI(controlPort, prompt, body);
		// Try to parse JSON from AI response
		const jsonMatch = result.content.match(/\{[\s\S]*\}/);
		let groups: any[] = [];
		if (jsonMatch) {
			try { groups = JSON.parse(jsonMatch[0]).groups || []; } catch { /* keep raw */ }
		}

		return jsonResponse({
			ok: true, action: 'compact', mode: 'analyze',
			analysis: result.content,
			groups, typeFilter,
			provider: result.provider, model: result.model,
			memoriesAnalyzed: filteredEntries.length,
		}, 200, corsHeaders);
	} catch (error) {
		return jsonResponse({ error: `Compact failed: ${toErrorMessage(error)}` }, 500, corsHeaders);
	}
}

/**
 * Clear: Two-phase deletion of outdated/redundant memories.
 *   analyze → AI identifies deletion candidates
 *   execute → delete confirmed IDs
 */
export async function handleClearOperation(
	controlPort: string,
	body: Record<string, unknown>,
	targetProject: string | undefined,
	mode: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const allEntries = await collectMemoryEntries(targetProject, true);

	if (mode === 'execute') {
		const ids = body.ids as string[] | undefined;
		if (!ids || ids.length === 0) {
			return jsonResponse({ error: "No IDs provided. Use mode='analyze' first." }, 400, corsHeaders);
		}

		const results: Array<{ id: string; title: string; deleted: boolean; error?: string }> = [];
		for (const id of ids) {
			const entry = allEntries.find((e) => e.id === id);
			if (!entry) {
				results.push({ id, title: id, deleted: false, error: 'Not found' });
				continue;
			}
			try {
				await unlink(entry.filePath);
				results.push({ id, title: entry.title, deleted: true });
			} catch (error) {
				results.push({ id, title: entry.title, deleted: false, error: toErrorMessage(error) });
			}
		}

		// Regenerate timelines
		const roots = new Set<string>();
		for (const e of allEntries) { const r = join(e.dir, '..'); if (!roots.has(r)) { roots.add(r); await regenerateTimeline(r).catch(() => {}); } }

		const deleted = results.filter((r) => r.deleted).length;
		return jsonResponse({
			ok: true, action: 'clear', mode: 'execute',
			analysis: `Clear Results\n=============\nDeleted: ${deleted}/${ids.length} memories\n\n${results.map(r => r.deleted ? `- ✓ ${r.title}` : `- ✗ ${r.title}: ${r.error}`).join('\n')}`,
			memoriesAnalyzed: allEntries.length, results,
		}, 200, corsHeaders);
	}

	// Analyze mode: AI identifies candidates
	const prompt = `You are a memory cleanup assistant. Identify memories that should be deleted.

## Memories:
${allEntries.map((e) => `- [${e.id}] "${e.title}" (${e.type}, ${e.created}): ${e.content.slice(0, 200)}`).join('\n')}

## Rules:
- Be conservative — only suggest clearly unneeded memories
- Session memories older than 14 days without unique insights are good candidates
- Keep architectural decisions, conventions, important patterns
- Keep bug fixes and lessons learned

## Output format (JSON only, no markdown):
{
  "candidates": [
    { "id": "memory-id", "title": "Title", "reason": "Why delete", "confidence": "high" }
  ]
}`;

	try {
		const result = await callAI(controlPort, prompt, body);
		const jsonMatch = result.content.match(/\{[\s\S]*\}/);
		let candidates: any[] = [];
		if (jsonMatch) {
			try { candidates = JSON.parse(jsonMatch[0]).candidates || []; } catch { /* keep raw */ }
		}

		return jsonResponse({
			ok: true, action: 'clear', mode: 'analyze',
			analysis: result.content,
			candidates,
			provider: result.provider, model: result.model,
			memoriesAnalyzed: allEntries.length,
		}, 200, corsHeaders);
	} catch (error) {
		return jsonResponse({ error: `Clear failed: ${toErrorMessage(error)}` }, 500, corsHeaders);
	}
}

/**
 * Summarize: Two-phase timeline consolidation.
 *   analyze → AI generates summary from date range
 *   execute → write summary file, delete originals
 *
 * Supports `body.type` filter: "all" (default), "note", or "session".
 * Matches MCP summarize_memories behavior.
 */
export async function handleSummarizeOperation(
	controlPort: string,
	body: Record<string, unknown>,
	targetProject: string | undefined,
	mode: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const allEntries = await collectMemoryEntries(targetProject, true);
	const days = typeof body.days === 'number' ? body.days : 7;
	const cutoff = new Date(Date.now() - days * 86400000).toISOString();

	// Filter by date range first
	const recentAll = allEntries.filter((e) => e.created && e.created >= cutoff);

	// Then filter by type — default to "all" (matching MCP summarize_memories behavior)
	const typeFilter = typeof body.type === 'string' ? body.type : 'all';
	const recent = typeFilter === 'all'
		? recentAll
		: recentAll.filter((e) => e.type === typeFilter);

	if (mode === 'execute') {
		const summary = body.summary as string | undefined;
		const title = (body.title as string) || `Summary: Last ${days} days`;
		const tags = (body.tags as string[]) || ['summary', 'timeline'];
		const originalIds = (body.originalIds as string[]) || [];

		if (!summary) {
			return jsonResponse({ error: "No summary provided. Use mode='analyze' first." }, 400, corsHeaders);
		}

		// Write summary file
		const targetDir = recent[0]?.dir || allEntries[0]?.dir;
		if (!targetDir) {
			return jsonResponse({ error: 'No memory directory found' }, 400, corsHeaders);
		}
		await mkdir(targetDir, { recursive: true });

		const dateStr = new Date().toISOString().slice(0, 10);
		const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
		const newId = `${dateStr}-summary-${slug}`;
		const newPath = join(targetDir, `${newId}.md`);

		const fileContent = `---
title: "${title}"
type: note
tags: [${tags.join(', ')}]
created: "${new Date().toISOString()}"
updated: "${new Date().toISOString()}"
---

${summary}`;

		await writeFile(newPath, fileContent, 'utf-8');

		// Delete originals if requested
		let deleted = 0;
		if (originalIds.length > 0) {
			for (const id of originalIds) {
				const entry = allEntries.find((e) => e.id === id);
				if (entry) {
					try { await unlink(entry.filePath); deleted++; } catch { /* skip */ }
				}
			}
		}

		// Regenerate timelines
		const roots = new Set<string>();
		for (const e of allEntries) { const r = join(e.dir, '..'); if (!roots.has(r)) { roots.add(r); await regenerateTimeline(r).catch(() => {}); } }

		return jsonResponse({
			ok: true, action: 'summarize', mode: 'execute',
			analysis: `Summary saved as ${newId}\nDeleted ${deleted} original memories`,
			summaryId: newId, deleted,
			memoriesAnalyzed: recent.length,
		}, 200, corsHeaders);
	}

	// Analyze mode: AI generates summary
	const typeLabel = typeFilter === 'all' ? '' : `${typeFilter} `;
	if (recent.length === 0) {
		return jsonResponse({
			ok: true, action: 'summarize', mode: 'analyze',
			analysis: `No ${typeLabel}memories found in the last ${days} days.`,
			memoriesAnalyzed: 0, typeFilter,
		}, 200, corsHeaders);
	}

	const prompt = `You are a memory summarization assistant. Create a consolidated timeline summary.

## Date Range: Last ${days} days (since ${cutoff.slice(0, 10)})

## ${typeLabel ? typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1) + 'memories' : 'Memories'}:
${recent.map((e) => `- [${e.id}] "${e.title}" (${e.type}, ${e.created}): ${e.content.slice(0, 500)}`).join('\n\n')}

## Task:
Create a chronological timeline of key events, decisions, and activities. Preserve important technical details.

## Output format (JSON only, no markdown):
{
  "title": "Summary: <concise topic>",
  "summary": "# Timeline Summary\\n\\n## <Date>\\n\\n- ...",
  "tags": ["keyword1", "keyword2"],
  "originalIds": [${recent.map((e) => `"${e.id}"`).join(', ')}]
}`;

	try {
		const result = await callAI(controlPort, prompt, body, 4000);
		const jsonMatch = result.content.match(/\{[\s\S]*\}/);
		let parsed: any = {};
		if (jsonMatch) {
			try { parsed = JSON.parse(jsonMatch[0]); } catch { /* keep raw */ }
		}

		return jsonResponse({
			ok: true, action: 'summarize', mode: 'analyze',
			analysis: result.content,
			suggestedTitle: parsed.title || `Summary: Last ${days} days`,
			suggestedSummary: parsed.summary || result.content,
			suggestedTags: parsed.tags || [],
			originalIds: parsed.originalIds || recent.map((e) => e.id),
			provider: result.provider, model: result.model,
			memoriesAnalyzed: recent.length, typeFilter,
		}, 200, corsHeaders);
	} catch (error) {
		return jsonResponse({ error: `Summarize failed: ${toErrorMessage(error)}` }, 500, corsHeaders);
	}
}
