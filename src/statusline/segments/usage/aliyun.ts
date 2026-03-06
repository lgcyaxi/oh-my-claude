import type { ProviderCacheEntry } from './types';
import { FETCH_TIMEOUT_MS } from './types';
import { getAliyunCredential } from '../../../shared/auth/aliyun';

interface AliyunQuotaInfo {
	per5HourUsedQuota?: number;
	per5HourTotalQuota?: number;
	perWeekUsedQuota?: number;
	perWeekTotalQuota?: number;
	perBillMonthUsedQuota?: number;
	perBillMonthTotalQuota?: number;
}

interface AliyunInstanceInfo {
	codingPlanQuotaInfo?: AliyunQuotaInfo;
	instanceName?: string;
	instanceType?: string;
	status?: string;
	remainingDays?: number;
}

interface AliyunQuotaApiResponse {
	code?: string;
	data?: {
		DataV2?: {
			data?: {
				data?: {
					codingPlanInstanceInfos?: AliyunInstanceInfo[];
				};
			};
		};
	};
}

/**
 * Fetch Aliyun Coding Plan quota using console cookies.
 * The API requires console session authentication (not API key).
 */
export async function fetchAliyunQuota(): Promise<ProviderCacheEntry | null> {
	try {
		const cred = getAliyunCredential();

		if (!cred?.cookie) {
			return null;
		}

		const url =
			'https://bailian-cs.console.aliyun.com/data/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=zeldaEasy.broadscope-bailian.codingPlan.queryCodingPlanInstanceInfoV2&_v=undefined';

		// The API is a POST with form-encoded body containing:
		// - params: JSON with Api, V, Data (including commodityCode and cornerstoneParam)
		// - region: cn-beijing
		// - sec_token: CSRF token from the console session
		// The login script captures the full formBody from the browser.
		const formBody = (cred as any).formBody;
		if (!formBody) return null;

		const headers: Record<string, string> = {
			Cookie: cred.cookie,
			'User-Agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			Accept: '*/*',
			'Content-Type': 'application/x-www-form-urlencoded',
			Referer: 'https://bailian.console.aliyun.com/',
			Origin: 'https://bailian.console.aliyun.com',
		};

		const resp = await fetch(url, {
			method: 'POST',
			headers,
			body: formBody,
			redirect: 'manual',
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

		// 302 = auth expired (redirects to err.taobao.com)
		if (resp.status === 302 || resp.status === 301) return null;
		if (!resp.ok) return null;

		const text = await resp.text();
		// Quick check: if response is HTML (redirect page), auth expired
		if (text.startsWith('<!') || text.startsWith('<html')) return null;

		const data = JSON.parse(text) as AliyunQuotaApiResponse;
		if (data.code !== '200') return null;

		// Navigate the nested response: data.DataV2.data.data.codingPlanInstanceInfos[0]
		const instances =
			data.data?.DataV2?.data?.data?.codingPlanInstanceInfos;
		if (!instances?.length) return null;

		// Use first valid instance
		const instance =
			instances.find((i) => i.status === 'VALID') ?? instances[0]!;
		const q = instance.codingPlanQuotaInfo;
		if (!q) return null;

		const h5Used = q.per5HourUsedQuota ?? 0;
		const h5Total = q.per5HourTotalQuota ?? 0;
		const wUsed = q.perWeekUsedQuota ?? 0;
		const wTotal = q.perWeekTotalQuota ?? 0;
		const mUsed = q.perBillMonthUsedQuota ?? 0;
		const mTotal = q.perBillMonthTotalQuota ?? 0;

		// Display: 5h% / w:week%
		const parts: string[] = [];

		if (h5Total > 0) {
			const pct = Math.round((h5Used / h5Total) * 100);
			parts.push(`${pct}%`);
		}
		if (wTotal > 0) {
			const pct = Math.round((wUsed / wTotal) * 100);
			parts.push(`w:${pct}%`);
		}
		// Always show monthly quota
		if (mTotal > 0) {
			const pct = Math.round((mUsed / mTotal) * 100);
			parts.push(`m:${pct}%`);
		}

		if (parts.length === 0) return null;
		const display = parts.join('/');

		// Color based on 5h window (most immediately actionable), then weekly
		const colorPct =
			h5Total > 0
				? Math.round((h5Used / h5Total) * 100)
				: wTotal > 0
					? Math.round((wUsed / wTotal) * 100)
					: mTotal > 0
						? Math.round((mUsed / mTotal) * 100)
						: 0;

		let color: 'good' | 'warning' | 'critical';
		if (colorPct < 50) color = 'good';
		else if (colorPct < 80) color = 'warning';
		else color = 'critical';

		return { timestamp: Date.now(), display, color };
	} catch {
		return null;
	}
}
