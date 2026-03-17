/**
 * Memory-related type definitions
 */

export interface MemoryEntry {
	id: string; // filename without .md
	filename: string;
	scope: string;
	type: string; // note, session, etc.
	tags: string[];
	created: string;
	title: string; // first heading or filename
	content: string; // full markdown content (without frontmatter)
	raw: string; // full file content including frontmatter
}

/** Extended entry with file path for deletion */
export interface MemoryEntryWithPath {
	id: string;
	title: string;
	content: string;
	type: string;
	created: string;
	filePath: string;
	dir: string;
}
