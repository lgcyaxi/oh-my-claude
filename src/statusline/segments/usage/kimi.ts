import type { ProviderCacheEntry } from './types';
import { FETCH_TIMEOUT_MS } from './types';
import { getKimiCredential } from '../../../shared/auth/kimi';

interface KimiUsageResponse {
	usages?: {
		scope?: string;
		detail?: {
			limit?: string;
			used?: string;
			remaining?: string;
			resetTime?: string;
		};
		limits?: {
			window?: { duration?: number; timeUnit?: string };
			detail?: {
				limit?: string;
				used?: string;
				remaining?: string;
				resetTime?: string;
			};
		}[];
	}[];
}

export async function fetchKimiQuota(): Promise<ProviderCacheEntry | null> {
	try {
		const cred = getKimiCredential();
		if (!cred?.token || !cred?.cookie) return null;

		let authExpired = false;
		const fetchUsages = async (
			body: Record<string, unknown>,
		): Promise<KimiUsageResponse | null> => {
			const resp = await fetch(
				'https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages',
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${cred.token}`,
						Cookie: cred.cookie,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(body),
					signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
				},
			);

			if (resp.status === 401 || resp.status === 403) {
				authExpired = true;
				return null;
			}
			if (!resp.ok) return null;
			return (await resp.json()) as KimiUsageResponse;
		};

		let data = await fetchUsages({ scope: ['FEATURE_CODING'] });
		let entry =
			data?.usages?.find((u) => u.scope === 'FEATURE_CODING') ??
			data?.usages?.find((u) => !!u.detail) ??
			data?.usages?.[0];

		// Some accounts/scopes do not expose FEATURE_CODING. Retry without scope filter.
		if (!entry?.detail) {
			data = await fetchUsages({});
			entry =
				data?.usages?.find((u) => u.scope === 'FEATURE_CODING') ??
				data?.usages?.find((u) => !!u.detail) ??
				data?.usages?.[0];
		}
		if (!entry?.detail) {
			return authExpired
				? { timestamp: Date.now(), display: '!auth', color: 'critical' }
				: null;
		}

		const parts: string[] = [];

		// Window quota (short-term rate limit, e.g. 5-min window)
		const windowLimit = entry.limits?.[0];
		let windowPct = 0;
		if (windowLimit?.detail) {
			const wLimit = parseInt(windowLimit.detail.limit || '100', 10);
			// API may return either "used" or "remaining" (prefer used, derive from remaining if absent)
			const wUsed =
				windowLimit.detail.used !== undefined
					? parseInt(windowLimit.detail.used, 10)
					: wLimit -
						parseInt(windowLimit.detail.remaining || '0', 10);
			windowPct = wLimit > 0 ? Math.round((wUsed / wLimit) * 100) : 0;
			parts.push(`${windowPct}%`);
		}

		// Weekly/overall quota
		const overallLimit = parseInt(entry.detail.limit || '100', 10);
		const overallUsed =
			entry.detail.used !== undefined
				? parseInt(entry.detail.used, 10)
				: overallLimit - parseInt(entry.detail.remaining || '0', 10);
		const weeklyPct =
			overallLimit > 0
				? Math.round((overallUsed / overallLimit) * 100)
				: 0;
		parts.push(`w:${weeklyPct}%`);

		const display = parts.join('/');

		// Color based on window usage (most immediately relevant)
		const colorPct = windowLimit?.detail ? windowPct : weeklyPct;
		let color: 'good' | 'warning' | 'critical';
		if (colorPct < 50) color = 'good';
		else if (colorPct < 80) color = 'warning';
		else color = 'critical';

		return { timestamp: Date.now(), display, color };
	} catch {
		return null;
	}
}
