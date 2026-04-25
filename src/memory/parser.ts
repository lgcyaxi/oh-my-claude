/**
 * Memory Markdown Parser
 *
 * Parses and serializes memory entries as markdown files with YAML frontmatter.
 * Follows the same frontmatter convention as the styles system.
 *
 * File format:
 * ```
 * ---
 * title: My Memory
 * type: note
 * tags: [pattern, convention]
 * created: 2026-01-29T10:00:00.000Z
 * updated: 2026-01-29T10:00:00.000Z
 * ---
 *
 * Memory content in markdown...
 * ```
 */

import type {
	MemoryEntry,
	MemoryFrontmatter,
	MemoryType,
	MemoryCategory,
} from './types';

/**
 * Parse a memory markdown file into a MemoryEntry
 */
export function parseMemoryFile(id: string, raw: string): MemoryEntry | null {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) {
		return null;
	}

	const frontmatterRaw = match[1] ?? '';
	const content = (match[2] ?? '').trim();

	const frontmatter = parseFrontmatter(frontmatterRaw);

	return {
		id,
		title: frontmatter.title || id,
		type: frontmatter.type,
		...(frontmatter.category && { category: frontmatter.category }),
		tags: frontmatter.tags,
		...(frontmatter.concepts &&
			frontmatter.concepts.length > 0 && {
				concepts: frontmatter.concepts,
			}),
		...(frontmatter.files &&
			frontmatter.files.length > 0 && { files: frontmatter.files }),
		content,
		createdAt: frontmatter.created,
		updatedAt: frontmatter.updated,
	};
}

/**
 * Serialize a MemoryEntry to markdown with YAML frontmatter
 */
export function serializeMemoryFile(entry: MemoryEntry): string {
	const tagsStr = entry.tags.length > 0 ? `[${entry.tags.join(', ')}]` : '[]';

	const lines = ['---', `title: ${entry.title}`, `type: ${entry.type}`];

	if (entry.category) {
		lines.push(`category: ${entry.category}`);
	}

	lines.push(`tags: ${tagsStr}`);

	if (entry.concepts && entry.concepts.length > 0) {
		lines.push(`concepts: [${entry.concepts.join(', ')}]`);
	}
	if (entry.files && entry.files.length > 0) {
		lines.push(`files: [${entry.files.join(', ')}]`);
	}

	lines.push(`created: ${entry.createdAt}`);
	lines.push(`updated: ${entry.updatedAt}`);
	lines.push('---');

	return lines.join('\n') + `\n\n${entry.content}\n`;
}

/**
 * Format a Date as `YYYY-MM-DD` in the local timezone. Using
 * `toISOString().slice(0,10)` produces a UTC day boundary, so users
 * west of UTC (e.g. UTC-7) would see evening sessions land in the next
 * calendar day. This helper honours `Date#getFullYear` / `#getMonth` /
 * `#getDate` to stay aligned with the user's local clock.
 */
export function formatLocalYYYYMMDD(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * Generate a memory ID from a title and timestamp.
 * Format: YYYY-MM-DD-slugified-title (local time — see formatLocalYYYYMMDD).
 */
export function generateMemoryId(title: string, date?: Date): string {
	const d = date ?? new Date();
	const datePrefix = formatLocalYYYYMMDD(d);
	const slug = slugify(title);
	return `${datePrefix}-${slug}`;
}

/**
 * Auto-generate a title from content (first line or first N chars)
 */
export function generateTitle(content: string): string {
	// Use first non-empty line, strip markdown heading prefix
	const firstLine = content
		.split('\n')
		.map((l) => l.trim())
		.find((l) => l.length > 0);

	if (!firstLine) return 'untitled';

	// Strip heading markers
	const cleaned = firstLine.replace(/^#+\s*/, '').trim();

	// Truncate to reasonable length
	if (cleaned.length > 80) {
		return cleaned.slice(0, 77) + '...';
	}

	return cleaned;
}

/**
 * Get the current timestamp in ISO 8601 format
 */
export function nowISO(): string {
	return new Date().toISOString();
}

/**
 * Strip private blocks from content.
 * Removes everything between `<!-- private -->` and `<!-- /private -->` markers.
 * Private content stays in raw markdown files but is excluded from indexing and API responses.
 */
export function stripPrivateBlocks(content: string): string {
	return content
		.replace(/<!--\s*private\s*-->[\s\S]*?<!--\s*\/private\s*-->/g, '')
		.trim();
}

// ---- Internal helpers ----

/**
 * Parse YAML frontmatter string into MemoryFrontmatter
 */
function parseFrontmatter(raw: string): MemoryFrontmatter {
	const now = nowISO();
	const result: MemoryFrontmatter = {
		title: '',
		type: 'note',
		tags: [],
		created: now,
		updated: now,
	};

	for (const line of raw.split('\n')) {
		const trimmed = line.trim();

		// title
		const titleMatch = trimmed.match(/^title:\s*(.+)$/);
		if (titleMatch?.[1]) {
			result.title = titleMatch[1].trim();
			continue;
		}

		// type
		const typeMatch = trimmed.match(/^type:\s*(.+)$/);
		if (typeMatch?.[1]) {
			const t = typeMatch[1].trim();
			if (t === 'session' || t === 'note') {
				result.type = t as MemoryType;
			}
			continue;
		}

		// category
		const categoryMatch = trimmed.match(/^category:\s*(.+)$/);
		if (categoryMatch?.[1]) {
			const c = categoryMatch[1].trim() as MemoryCategory;
			const validCategories: MemoryCategory[] = [
				'architecture',
				'convention',
				'decision',
				'debugging',
				'workflow',
				'pattern',
				'reference',
				'session',
				'uncategorized',
			];
			if (validCategories.includes(c)) {
				result.category = c;
			}
			continue;
		}

		// tags (supports [tag1, tag2] and tag1, tag2 formats)
		const tagsMatch = trimmed.match(/^tags:\s*(.+)$/);
		if (tagsMatch?.[1]) {
			result.tags = parseBracketArray(tagsMatch[1].trim());
			continue;
		}

		// concepts (same bracket-array format as tags)
		const conceptsMatch = trimmed.match(/^concepts:\s*(.+)$/);
		if (conceptsMatch?.[1]) {
			result.concepts = parseBracketArray(conceptsMatch[1].trim());
			continue;
		}

		// files (same bracket-array format as tags)
		const filesMatch = trimmed.match(/^files:\s*(.+)$/);
		if (filesMatch?.[1]) {
			result.files = parseBracketArray(filesMatch[1].trim());
			continue;
		}

		// created
		const createdMatch = trimmed.match(/^created:\s*(.+)$/);
		if (createdMatch?.[1]) {
			// Strip surrounding quotes if present (some files have "2026-01-29T10:00:00.000Z")
			let value = createdMatch[1].trim();
			if (value.startsWith('"') && value.endsWith('"')) {
				value = value.slice(1, -1);
			}
			result.created = value;
			continue;
		}

		// updated
		const updatedMatch = trimmed.match(/^updated:\s*(.+)$/);
		if (updatedMatch?.[1]) {
			let value = updatedMatch[1].trim();
			if (value.startsWith('"') && value.endsWith('"')) {
				value = value.slice(1, -1);
			}
			result.updated = value;
			continue;
		}
	}

	return result;
}

/**
 * Parse a tags string into an array
 * Supports: [tag1, tag2], "tag1, tag2", [tag1,tag2]
 */
function parseBracketArray(raw: string): string[] {
	// Strip brackets
	const stripped = raw.replace(/^\[/, '').replace(/\]$/, '').trim();
	if (!stripped) return [];

	return stripped
		.split(',')
		.map((t) => t.trim())
		.filter((t) => t.length > 0);
}

/**
 * Slugify a string for use as a filename
 */
function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except spaces and hyphens
		.replace(/\s+/g, '-') // Replace spaces with hyphens
		.replace(/-+/g, '-') // Collapse multiple hyphens
		.replace(/^-|-$/g, '') // Trim leading/trailing hyphens
		.slice(0, 50); // Limit length
}
