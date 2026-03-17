/**
 * Session JSONL parsing — extract metadata and conversation entries
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { ConversationEntry } from './types';

/**
 * Extract basic metadata by reading only the first ~30 lines of a JSONL file.
 * Uses file mtime for the modified timestamp (avoids full-file scan).
 */
export async function extractQuickMeta(
	filePath: string,
	fileMtime: Date,
): Promise<{
	firstPrompt: string;
	created: string;
	modified: string;
	gitBranch: string;
	messageCount: number;
} | null> {
	try {
		const rl = createInterface({
			input: createReadStream(filePath, { encoding: 'utf-8' }),
			crlfDelay: Infinity,
		});

		let firstPrompt = '';
		let created = '';
		let gitBranch = '';
		let linesRead = 0;
		const MAX_LINES = 30;

		for await (const line of rl) {
			if (!line.trim()) continue;
			linesRead++;
			try {
				const entry = JSON.parse(line) as ConversationEntry;

				// Get created timestamp from first entry
				if (!created && entry.timestamp) {
					created = entry.timestamp;
				}

				// Get git branch from first entry that has it
				if (!gitBranch && entry.gitBranch) {
					gitBranch = entry.gitBranch;
				}

				// Get first user prompt
				if (
					entry.type === 'user' &&
					!firstPrompt &&
					entry.message
				) {
					const content = entry.message.content;
					if (typeof content === 'string') {
						firstPrompt = content.slice(0, 200);
					} else if (Array.isArray(content)) {
						const textBlock = content.find(
							(b) => b.type === 'text' && b.text,
						);
						if (textBlock?.text) {
							firstPrompt = textBlock.text.slice(0, 200);
						}
					}
				}
			} catch {
				// skip malformed
			}

			// Stop early once we have what we need or hit limit
			if (
				(firstPrompt && gitBranch && created) ||
				linesRead >= MAX_LINES
			) {
				rl.close();
				break;
			}
		}

		if (!created) return null;

		return {
			firstPrompt,
			created,
			modified: fileMtime.toISOString(),
			gitBranch,
			messageCount: 0, // unknown without full scan; UI will show "—"
		};
	} catch {
		return null;
	}
}

/** Parse JSONL file into conversation entries, filtering to renderable types */
export async function parseConversation(
	filePath: string,
): Promise<ConversationEntry[]> {
	const entries: ConversationEntry[] = [];
	const renderableTypes = new Set(['user', 'assistant']);

	try {
		const rl = createInterface({
			input: createReadStream(filePath, { encoding: 'utf-8' }),
			crlfDelay: Infinity,
		});

		for await (const line of rl) {
			if (!line.trim()) continue;
			try {
				const entry = JSON.parse(line) as ConversationEntry;
				if (
					renderableTypes.has(entry.type) &&
					!entry.isSidechain
				) {
					entries.push(entry);
				}
			} catch {
				// skip malformed lines
			}
		}
	} catch {
		// file not found or unreadable
	}

	return entries;
}
