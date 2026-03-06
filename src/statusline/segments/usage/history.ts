/**
 * Usage history — records snapshots and computes trend indicators.
 *
 * The statusline calls recordSnapshots() after each collect cycle,
 * appending one snapshot per provider, and getTrendIndicator()
 * to show ↑↓→ arrows next to values.
 *
 * History file: ~/.config/oh-my-claude/usage-history.json
 * Retention: 48 hours, pruned every 6 hours.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { PartResult } from './types';

const HISTORY_DIR = join(homedir(), '.config', 'oh-my-claude');
const HISTORY_PATH = join(HISTORY_DIR, 'usage-history.json');

/** Max age for snapshots (48 hours) */
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
/** Minimum interval between prunes (6 hours) */
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Time window around 24h-ago for trend comparison (±4 hours) */
const TREND_WINDOW_MS = 4 * 60 * 60 * 1000;
/** Minimum relative change to show an arrow (5%) */
const TREND_THRESHOLD = 0.05;

interface UsageSnapshot {
	/** Epoch milliseconds */
	t: number;
	/** Provider key (abbreviation) */
	p: string;
	/** Numeric value (null if unparseable) */
	v: number | null;
}

interface UsageHistory {
	snapshots: UsageSnapshot[];
	lastPruned: number;
}

/**
 * Extract a numeric value from a display string.
 *
 * Examples:
 * - "¥1988.61" → 1988.61
 * - "¥1988" → 1988
 * - "45%" → 45
 * - "5req" → 5
 * - "0%/w:12%" → null (compound, skip)
 * - "5h:30%/w:12%" → null
 */
export function extractNumericValue(display: string): number | null {
	// Skip compound displays with "/" separator
	if (display.includes('/')) return null;

	// Strip currency symbols and unit suffixes
	const cleaned = display.replace(/^[¥$€£]/, '').replace(/(req|c|%)$/, '');
	const num = parseFloat(cleaned);
	return isNaN(num) ? null : num;
}

/**
 * Record snapshots from a collect cycle.
 * Called by the statusline after each successful fetch.
 */
export function recordSnapshots(parts: PartResult[]): void {
	try {
		const history = readHistory();
		const now = Date.now();

		for (const part of parts) {
			const v = extractNumericValue(part.display);
			history.snapshots.push({ t: now, p: part.abbrev, v });
		}

		// Prune old entries if due
		if (now - history.lastPruned > PRUNE_INTERVAL_MS) {
			const cutoff = now - MAX_AGE_MS;
			history.snapshots = history.snapshots.filter((s) => s.t > cutoff);
			history.lastPruned = now;
		}

		writeHistory(history);
	} catch {
		// Silently fail — history is non-critical
	}
}

/**
 * Get a trend indicator for a provider's current value.
 *
 * Compares the current value to the closest snapshot near 24h ago.
 * Returns "" if insufficient history (< 20h of data).
 */
export function getTrendIndicator(
	provider: string,
	currentValue: number,
): '↑' | '↓' | '→' | '' {
	try {
		const history = readHistory();
		const now = Date.now();
		const target = now - 24 * 60 * 60 * 1000; // 24h ago
		const windowStart = target - TREND_WINDOW_MS;
		const windowEnd = target + TREND_WINDOW_MS;

		// Find snapshots for this provider within the comparison window
		const candidates = history.snapshots.filter(
			(s) =>
				s.p === provider &&
				s.v !== null &&
				s.t >= windowStart &&
				s.t <= windowEnd,
		);

		if (candidates.length === 0) return '';

		// Pick the snapshot closest to 24h ago
		let closest = candidates[0]!;
		let minDist = Math.abs(closest.t - target);
		for (const s of candidates) {
			const dist = Math.abs(s.t - target);
			if (dist < minDist) {
				closest = s;
				minDist = dist;
			}
		}

		const oldValue = closest.v!;
		if (oldValue === 0) {
			return currentValue > 0 ? '↑' : '→';
		}

		const change = (currentValue - oldValue) / Math.abs(oldValue);

		if (change > TREND_THRESHOLD) return '↑';
		if (change < -TREND_THRESHOLD) return '↓';
		return '→';
	} catch {
		return '';
	}
}

export function readHistory(): UsageHistory {
	try {
		if (!existsSync(HISTORY_PATH)) return { snapshots: [], lastPruned: 0 };
		const content = readFileSync(HISTORY_PATH, 'utf-8');
		return JSON.parse(content) as UsageHistory;
	} catch {
		return { snapshots: [], lastPruned: 0 };
	}
}

export function writeHistory(h: UsageHistory): void {
	try {
		if (!existsSync(HISTORY_DIR)) {
			mkdirSync(HISTORY_DIR, { recursive: true });
		}
		writeFileSync(HISTORY_PATH, JSON.stringify(h), 'utf-8');
	} catch {
		// Silently fail
	}
}
