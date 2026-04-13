/**
 * AI-powered session rename endpoint
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { jsonResponse } from '../helpers';
import { toErrorMessage } from '../../../shared/utils';
import type { SessionIndex } from './types';
import { PROJECTS_DIR, resolveProjectPath } from './path';
import { extractQuickMeta } from './parser';
import { parseConversation } from './parser';

/**
 * POST /api/sessions/:folder/:id/ai-rename
 * Uses a configured provider to generate a concise summary from conversation content.
 * Accepts optional { provider, model } in body to override the default.
 */
export async function handleAiRename(
	req: Request,
	folder: string,
	sessionId: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const jsonlPath = join(PROJECTS_DIR, folder, `${sessionId}.jsonl`);
	if (!existsSync(jsonlPath)) {
		return jsonResponse({ error: 'Session not found' }, 404, corsHeaders);
	}

	// Parse optional provider/model from body
	let bodyProvider: string | undefined;
	let bodyModel: string | undefined;
	try {
		const body = (await req.json()) as Record<string, unknown>;
		if (typeof body.provider === 'string') bodyProvider = body.provider;
		if (typeof body.model === 'string') bodyModel = body.model;
	} catch {
		// Empty body is fine — use defaults
	}

	// Extract first few user/assistant messages for context
	const entries = await parseConversation(jsonlPath);
	if (entries.length === 0) {
		return jsonResponse(
			{ error: 'Session has no conversation messages' },
			400,
			corsHeaders,
		);
	}

	// Build context from first ~5 user messages and ~3 assistant text blocks
	const snippets: string[] = [];
	let userCount = 0;
	let assistantCount = 0;

	for (const entry of entries) {
		if (!entry.message) continue;
		const content = entry.message.content;

		if (entry.type === 'user' && userCount < 5) {
			if (typeof content === 'string') {
				snippets.push(`User: ${content.slice(0, 300)}`);
			} else if (Array.isArray(content)) {
				const text = content
					.filter((b) => b.type === 'text' && b.text)
					.map((b) => b.text!)
					.join(' ');
				if (text) snippets.push(`User: ${text.slice(0, 300)}`);
			}
			userCount++;
		} else if (entry.type === 'assistant' && assistantCount < 3) {
			if (typeof content === 'string') {
				snippets.push(`Assistant: ${content.slice(0, 200)}`);
			} else if (Array.isArray(content)) {
				const text = content
					.filter((b) => b.type === 'text' && b.text)
					.map((b) => b.text!)
					.join(' ');
				if (text) snippets.push(`Assistant: ${text.slice(0, 200)}`);
			}
			assistantCount++;
		}

		if (userCount >= 5 && assistantCount >= 3) break;
	}

	const conversationContext = snippets.join('\n\n');

	// Call /internal/complete via internal fetch
	const controlPort = new URL(req.url).port || '18920';
	try {
		const resp = await fetch(
			`http://localhost:${controlPort}/internal/complete`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					provider: bodyProvider,
					model: bodyModel,
					max_tokens: 1024,
					temperature: 0.3,
					messages: [
						{
							role: 'user',
							content: `Generate a concise title (5-10 words, no quotes) summarizing this Claude Code conversation:\n\n${conversationContext}`,
						},
					],
				}),
				signal: AbortSignal.timeout(15000),
			},
		);

		if (!resp.ok) {
			const err = await resp.json().catch(() => ({}));
			return jsonResponse(
				{
					error: `AI provider failed: ${(err as { error?: string }).error ?? resp.statusText}`,
				},
				502,
				corsHeaders,
			);
		}

		const result = (await resp.json()) as {
			content: string;
			provider: string;
			model: string;
		};
		const summary = result.content
			.trim()
			.replace(/^["']|["']$/g, '')
			.slice(0, 120);

		if (!summary) {
			return jsonResponse(
				{ error: 'AI returned empty summary' },
				500,
				corsHeaders,
			);
		}

		// Save the summary to sessions-index.json
		const indexPath = join(PROJECTS_DIR, folder, 'sessions-index.json');
		try {
			const raw = await readFile(indexPath, 'utf-8');
			const index = JSON.parse(raw) as SessionIndex;
			const indexEntry = index.entries.find(
				(e) => e.sessionId === sessionId,
			);
			if (indexEntry) {
				indexEntry.summary = summary;
			} else {
				const fileMtime = (await stat(jsonlPath)).mtime;
				const meta = await extractQuickMeta(jsonlPath, fileMtime);
				index.entries.push({
					sessionId,
					firstPrompt: meta?.firstPrompt ?? '',
					summary,
					messageCount: meta?.messageCount ?? 0,
					created: meta?.created ?? fileMtime.toISOString(),
					modified: fileMtime.toISOString(),
					gitBranch: meta?.gitBranch ?? '',
					projectPath:
						index.originalPath ??
						(await resolveProjectPath(folder)),
					isSidechain: false,
				});
			}
			await writeFile(
				indexPath,
				JSON.stringify(index, null, 2),
				'utf-8',
			);
		} catch {
			const fileMtime = (await stat(jsonlPath)).mtime;
			const meta = await extractQuickMeta(jsonlPath, fileMtime);
			const newIndex: SessionIndex = {
				version: 1,
				entries: [
					{
						sessionId,
						firstPrompt: meta?.firstPrompt ?? '',
						summary,
						messageCount: meta?.messageCount ?? 0,
						created: meta?.created ?? fileMtime.toISOString(),
						modified: fileMtime.toISOString(),
						gitBranch: meta?.gitBranch ?? '',
						projectPath: await resolveProjectPath(folder),
						isSidechain: false,
					},
				],
			};
			await writeFile(
				indexPath,
				JSON.stringify(newIndex, null, 2),
				'utf-8',
			);
		}

		return jsonResponse(
			{
				ok: true,
				sessionId,
				summary,
				provider: result.provider,
				model: result.model,
			},
			200,
			corsHeaders,
		);
	} catch (error) {
		return jsonResponse(
			{
				error: `AI rename failed: ${toErrorMessage(error)}`,
			},
			500,
			corsHeaders,
		);
	}
}
