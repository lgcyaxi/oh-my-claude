import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type {
	Segment,
	SegmentData,
	SegmentContext,
	SegmentConfig,
	StyleConfig,
} from './types';
import { wrapBrackets, applyColor } from './index';

const STATUS_SIGNAL_PATH = join(
	homedir(),
	'.claude',
	'oh-my-claude',
	'run',
	'opencode-status.json',
);

interface OpenCodeStatusSignal {
	state:
		| 'idle'
		| 'starting'
		| 'thinking'
		| 'streaming'
		| 'complete'
		| 'error';
	tool?: string;
	model?: string;
	updatedAt: number;
}

const STALE_THRESHOLDS: Record<string, number> = {
	starting: 30_000,
	thinking: 30_000,
	streaming: 30_000,
	complete: 5_000,
	error: 30_000,
	idle: 0,
};

function readStatusSignal(): OpenCodeStatusSignal | null {
	try {
		const raw = readFileSync(STATUS_SIGNAL_PATH, 'utf-8');
		return JSON.parse(raw) as OpenCodeStatusSignal;
	} catch {
		return null;
	}
}

async function collectOpenCodeData(
	_context: SegmentContext,
): Promise<SegmentData | null> {
	const signal = readStatusSignal();
	if (!signal || signal.state === 'idle') {
		return null;
	}

	const age = Date.now() - (signal.updatedAt ?? 0);
	const threshold = STALE_THRESHOLDS[signal.state] ?? 30_000;
	if (age > threshold) {
		return null;
	}

	let icon: string;
	let color: SegmentData['color'];

	switch (signal.state) {
		case 'starting':
		case 'thinking':
		case 'streaming':
			icon = '⟳';
			color = 'warning';
			break;
		case 'complete':
			icon = '✓';
			color = 'good';
			break;
		case 'error':
			icon = '✗';
			color = 'critical';
			break;
		default:
			return null;
	}

	const label = signal.tool ? `OpenCode: ${signal.tool}` : 'OpenCode';
	return {
		primary: `${icon} ${label}`,
		metadata: {
			state: signal.state,
			model: signal.model ?? '',
		},
		color,
	};
}

function formatOpenCodeSegment(
	data: SegmentData,
	_config: SegmentConfig,
	style: StyleConfig,
): string {
	const colored = applyColor(data.primary, data.color, style);
	return wrapBrackets(colored, style);
}

export const opencodeSegment: Segment = {
	id: 'opencode',
	collect: collectOpenCodeData,
	format: formatOpenCodeSegment,
};
