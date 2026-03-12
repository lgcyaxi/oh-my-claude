import type { ProviderCacheEntry } from './types';
import { FETCH_TIMEOUT_MS } from './types';
import { getMiniMaxCredential } from '../../../shared/auth/minimax';

interface MiniMaxModelRemain {
	start_time: number;
	end_time: number;
	remains_time: number;
	current_interval_total_count: number;
	current_interval_usage_count: number;
	model_name: string;
}

interface MiniMaxQuotaResponse {
	model_remains: MiniMaxModelRemain[];
	base_resp: {
		status_code: number;
		status_msg: string;
	};
}

/** Parse MiniMax quota response into a cache entry */
function parseMiniMaxQuotaResponse(
	data: MiniMaxQuotaResponse,
): ProviderCacheEntry | null {
	if (!data.model_remains?.length) return null;

	// Get the first model (usually MiniMax-M2)
	const model = data.model_remains[0]!;
	const {
		current_interval_total_count: total,
		current_interval_usage_count: remaining,
	} = model;

	// current_interval_usage_count is actually "remaining" count, not "used" count
	const used = total - remaining;
	const pct = total > 0 ? Math.round((used / total) * 100) : 0;

	const display = `${pct}%`;

	let color: 'good' | 'warning' | 'critical';
	if (pct < 50) {
		color = 'good';
	} else if (pct < 80) {
		color = 'warning';
	} else {
		color = 'critical';
	}

	return { timestamp: Date.now(), display, color };
}

/**
 * Resolve MiniMax GroupId from:
 * 1. MINIMAX_GROUP_ID env var
 * 2. Saved credentials from `oh-my-claude auth login minimax`
 */
function resolveMiniMaxGroupId(): { groupId: string; cookie?: string } | null {
	// 1. Environment variable takes priority (accept both case + naming conventions)
	const envGroupId =
		process.env.MINIMAX_GROUP_ID ||
		process.env.MINIMAX_GROUPID ||
		process.env.minimax_group_id ||
		process.env.minimax_groupid;
	if (envGroupId) {
		return { groupId: envGroupId };
	}

	// 2. Saved credentials (groupId persists even if cookie expired)
	const cred = getMiniMaxCredential();
	if (cred?.groupId) {
		return { groupId: cred.groupId, cookie: cred.cookie };
	}

	return null;
}

/**
 * Fetch MiniMax quota usage.
 *
 * Strategy (in order):
 * 1. API key only (no GroupId needed — endpoint works without it)
 * 2. API key + GroupId (specific group quota)
 * 3. Cookie-based via www.minimaxi.com (legacy, from auth login)
 * 4. Returns null (caller falls back to local req count)
 */
export async function fetchMiniMaxQuota(): Promise<ProviderCacheEntry | null> {
	try {
		// CN quota API uses MINIMAX_CN_API_KEY (fall back to MINIMAX_API_KEY for backward compat)
		const apiKey =
			process.env.MINIMAX_CN_API_KEY || process.env.MINIMAX_API_KEY;

		// Strategy 1: API key only (works without GroupId)
		if (apiKey) {
			try {
				const resp = await fetch(
					'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains',
					{
						headers: {
							Accept: 'application/json',
							Authorization: `Bearer ${apiKey}`,
						},
						signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
					},
				);
				if (resp.ok) {
					const data = (await resp.json()) as MiniMaxQuotaResponse;
					if (
						data.base_resp?.status_code === 0 ||
						data.model_remains?.length
					) {
						const result = parseMiniMaxQuotaResponse(data);
						if (result) return result;
					}
				}
			} catch {
				// Fall through to GroupId strategies
			}
		}

		const resolved = resolveMiniMaxGroupId();
		if (!resolved) return null;

		const { groupId, cookie } = resolved;

		// Strategy 2: API key + GroupId (specific group quota) or cookie-based
		if (apiKey && groupId) {
			try {
				const urls = [
					`https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains?group_id=${encodeURIComponent(groupId)}`,
					`https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains?GroupId=${encodeURIComponent(groupId)}`,
				];
				for (const url of urls) {
					const resp = await fetch(url, {
						headers: {
							Accept: 'application/json',
							Authorization: `Bearer ${apiKey}`,
						},
						signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
					});
					if (resp.ok) {
						const data =
							(await resp.json()) as MiniMaxQuotaResponse;
						if (data.base_resp?.status_code === 0) {
							const result = parseMiniMaxQuotaResponse(data);
							if (result) return result;
						}
					}
				}
			} catch {
				// Fall through to cookie-based
			}
		}

		// Strategy 3: Cookie-based (legacy fallback for expired API key scenarios)
		if (cookie && groupId) {
			try {
				const urls = [
					`https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains?group_id=${encodeURIComponent(groupId)}`,
					`https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains?GroupId=${encodeURIComponent(groupId)}`,
				];
				for (const url of urls) {
					const resp = await fetch(url, {
						headers: { Cookie: cookie },
						signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
					});
					if (!resp.ok) continue;

					const data = (await resp.json()) as MiniMaxQuotaResponse;
					const parsed = parseMiniMaxQuotaResponse(data);
					if (parsed) return parsed;
				}
				return null;
			} catch {
				return null;
			}
		}

		return null;
	} catch {
		return null;
	}
}
