/**
 * Segment types for oh-my-claude statusline
 * Segment-based architecture with toggleable segments
 */

// Segment identifiers
export type SegmentId =
	| 'model'
	| 'git'
	| 'directory'
	| 'context'
	| 'session'
	| 'output-style'
	| 'memory'
	| 'mode'
	| 'proxy'
	| 'usage'
	| 'preferences'
	| 'codex'
	| 'opencode';

export const ALL_SEGMENT_IDS: SegmentId[] = [
	'model',
	'git',
	'directory',
	'context',
	'session',
	'output-style',
	'memory',
	'mode',
	'proxy',
	'usage',
	'preferences',
	'codex',
	'opencode',
];

// Semantic colors for status indication
export type SemanticColor = 'good' | 'warning' | 'critical' | 'neutral';

// Data returned by a segment's collect function
export interface SegmentData {
	primary: string;
	secondary?: string;
	metadata: Record<string, string>;
	color?: SemanticColor;
}

// Context passed to segment collect functions
export interface SegmentContext {
	cwd: string;
	sessionDir: string;
	// Data from Claude Code stdin (when available)
	claudeCodeInput?: ClaudeCodeInput;
}

// Partial Claude Code stdin data we care about
export interface ClaudeCodeInput {
	model?: {
		id?: string;
		display_name?: string;
	};
	output_style?: {
		name?: string;
	};
	// Transcript path for context/token parsing
	transcript_path?: string;
	// Cost/usage data from Claude Code
	cost?: {
		total_cost_usd?: number;
		total_duration_ms?: number;
		total_api_duration_ms?: number;
		total_lines_added?: number;
		total_lines_removed?: number;
	};
	// Workspace info
	workspace?: {
		current_dir?: string;
	};
	// OAuth config for API calls (if available)
	oauth?: {
		api_base_url?: string;
		access_token?: string;
	};
}

// Per-segment configuration
export interface SegmentConfig {
	enabled: boolean;
	position: number;
	row: number;
}

// Style configuration
export interface StyleConfig {
	separator: string;
	brackets: boolean;
	colors: boolean;
}

// Full statusline configuration
export interface StatusLineConfig {
	enabled: boolean;
	preset: 'minimal' | 'standard' | 'full';
	segments: Record<SegmentId, SegmentConfig>;
	style: StyleConfig;
}

// Segment interface - all segments must implement this
export interface Segment {
	id: SegmentId;
	collect(context: SegmentContext): Promise<SegmentData | null>;
	format(
		data: SegmentData,
		config: SegmentConfig,
		style: StyleConfig,
	): string;
}

// Preset definitions
export const PRESETS: Record<StatusLineConfig['preset'], SegmentId[]> = {
	minimal: ['git', 'directory'],
	standard: [
		'model',
		'git',
		'directory',
		'context',
		'session',
		'mode',
		'proxy',
		'usage',
	],
	full: [
		'model',
		'git',
		'directory',
		'context',
		'session',
		'output-style',
		'memory',
		'mode',
		'proxy',
		'usage',
		'preferences',
		'codex',
		'opencode',
	],
};

// Default segment rows — semantically grouped
// Row 1: Session & Identity (what session, what model)
// Row 2: Workspace & Context (what am I working on)
// Row 3: Infrastructure (background systems)
export const DEFAULT_SEGMENT_ROWS: Record<SegmentId, number> = {
	proxy: 1,
	session: 1,
	model: 1,
	mode: 1,
	git: 2,
	directory: 2,
	context: 2,
	memory: 2,
	preferences: 2,
	'output-style': 2,
	codex: 3,
	opencode: 3,
	usage: 3,
};

// Default segment positions — order within each row (1-based)
export const DEFAULT_SEGMENT_POSITIONS: Record<SegmentId, number> = {
	proxy: 1,
	session: 2,
	model: 3,
	mode: 4,
	git: 1,
	directory: 2,
	context: 3,
	memory: 4,
	preferences: 5,
	'output-style': 6,
	codex: 1,
	opencode: 2,
	usage: 3,
};
