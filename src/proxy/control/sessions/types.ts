/**
 * Session-related type definitions
 */

export interface SessionIndexEntry {
	sessionId: string;
	firstPrompt: string;
	summary: string;
	messageCount: number;
	created: string;
	modified: string;
	gitBranch: string;
	projectPath: string;
	isSidechain: boolean;
}

export interface SessionIndex {
	version: number;
	entries: SessionIndexEntry[];
	originalPath?: string;
}

export interface ConversationEntry {
	type: string;
	uuid: string;
	timestamp: string;
	message?: {
		role: string;
		content: string | ContentBlock[];
		model?: string;
	};
	parentUuid?: string | null;
	isSidechain?: boolean;
	gitBranch?: string;
	cwd?: string;
}

export interface ContentBlock {
	type: string;
	text?: string;
	thinking?: string;
	name?: string;
	input?: unknown;
	id?: string;
	content?: string | ContentBlock[];
	tool_use_id?: string;
}
