/**
 * Usage segment - shows provider balance/quota on the statusline
 *
 * Standalone: fetches directly from provider APIs via the orchestrator pipeline.
 * Does NOT depend on the proxy daemon — works with or without it.
 *
 * Cache: ~/.config/oh-my-claude/usage-cache.json with 60s TTL per provider.
 * The statusline is the sole writer; the proxy never touches this file.
 *
 * Color coding:
 * - Green: healthy (balance > threshold or usage < 50%)
 * - Yellow: warning (balance low or usage 50-80%)
 * - Red: critical (balance near-zero or usage > 80%)
 *
 * Renders on row 3 (Infrastructure) via config.segments.usage.row.
 */

import type {
	Segment,
	SegmentData,
	SegmentContext,
	SegmentConfig,
	StyleConfig,
} from '../types';
import { SEMANTIC_COLORS } from '../index';
import { buildProviderRegistry } from './provider-registry';
import { fetchAllProviders } from './orchestrator';
import { readCache, writeCache } from './cache';
import { recordSnapshots } from './history';

const PROVIDER_TIMEOUT_MS = 3000;

/**
 * Collect usage data from all configured providers via the orchestrator pipeline.
 */
async function collectUsageData(
	_context: SegmentContext,
): Promise<SegmentData | null> {
	try {
		const registry = buildProviderRegistry();
		const cache = readCache();
		const { parts, cacheModified, updatedCache } = await fetchAllProviders(
			registry,
			cache,
			PROVIDER_TIMEOUT_MS,
		);

		if (cacheModified) {
			writeCache(updatedCache);
		}

		if (parts.length > 0) {
			recordSnapshots(parts);
		}

		if (parts.length === 0) {
			return null;
		}

		const primary = parts
			.map((p) => (p.display ? `${p.abbrev}:${p.display}` : p.abbrev))
			.join(' | ');

		let overallColor: 'good' | 'warning' | 'critical' = 'good';
		for (const p of parts) {
			if (p.color === 'critical') {
				overallColor = 'critical';
				break;
			}
			if (p.color === 'warning') {
				overallColor = 'warning';
			}
		}

		const metadata: Record<string, string> = {};
		for (const p of parts) {
			metadata[`${p.abbrev}_display`] = p.display;
			metadata[`${p.abbrev}_color`] = p.color;
		}

		return {
			primary,
			metadata,
			color: overallColor,
		};
	} catch {
		return null;
	}
}

/**
 * Format usage segment — applies per-provider colors
 */
function formatUsageSegment(
	data: SegmentData,
	_config: SegmentConfig,
	style: StyleConfig,
): string {
	if (!style.colors) {
		return data.primary;
	}

	const coloredParts: string[] = [];
	const rawParts = data.primary.split(' | ');

	for (const part of rawParts) {
		const colonIdx = part.indexOf(':');
		if (colonIdx === -1) {
			const partColor = data.metadata[`${part}_color`];
			if (partColor && partColor in SEMANTIC_COLORS) {
				const colorCode =
					SEMANTIC_COLORS[partColor as keyof typeof SEMANTIC_COLORS];
				coloredParts.push(
					`${colorCode}${part}${SEMANTIC_COLORS.reset}`,
				);
			} else {
				coloredParts.push(
					`${SEMANTIC_COLORS.neutral}${part}${SEMANTIC_COLORS.reset}`,
				);
			}
			continue;
		}

		const abbrev = part.slice(0, colonIdx);
		const value = part.slice(colonIdx + 1);
		const partColor = data.metadata[`${abbrev}_color`];

		const styledAbbrev = `\x1b[1;37m${abbrev}\x1b[0m`;
		if (partColor && partColor in SEMANTIC_COLORS) {
			const colorCode =
				SEMANTIC_COLORS[partColor as keyof typeof SEMANTIC_COLORS];
			coloredParts.push(
				`${styledAbbrev}:${colorCode}${value}${SEMANTIC_COLORS.reset}`,
			);
		} else {
			coloredParts.push(
				`${styledAbbrev}:${SEMANTIC_COLORS.neutral}${value}${SEMANTIC_COLORS.reset}`,
			);
		}
	}

	return coloredParts.join(' | ');
}

export const usageSegment: Segment = {
	id: 'usage',
	collect: collectUsageData,
	format: formatUsageSegment,
};
