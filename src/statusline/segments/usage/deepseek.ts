import type { ProviderCacheEntry } from './types';
import { FETCH_TIMEOUT_MS } from './types';

interface DeepSeekBalanceInfo {
	currency: string;
	total_balance: string;
	granted_balance: string;
	topped_up_balance: string;
}

interface DeepSeekBalanceResponse {
	is_available: boolean;
	balance_infos: DeepSeekBalanceInfo[];
}

export async function fetchDeepSeekBalance(
	apiKey: string,
): Promise<ProviderCacheEntry | null> {
	try {
		const resp = await fetch('https://api.deepseek.com/user/balance', {
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!resp.ok) return null;

		const data = (await resp.json()) as DeepSeekBalanceResponse;
		if (!data.balance_infos?.length) return null;

		// Prefer CNY, fallback to first available
		const cny = data.balance_infos.find((b) => b.currency === 'CNY');
		const info = cny ?? data.balance_infos[0]!;
		const balance = parseFloat(info.total_balance);
		const symbol = info.currency === 'CNY' ? '\u00a5' : '$';

		// Format: always show full amount with 2 decimal places
		const displayBalance = `${symbol}${balance.toFixed(2)}`;

		// Color thresholds (CNY)
		let color: 'good' | 'warning' | 'critical';
		if (balance > 100) {
			color = 'good';
		} else if (balance > 10) {
			color = 'warning';
		} else {
			color = 'critical';
		}

		return { timestamp: Date.now(), display: displayBalance, color };
	} catch {
		return null;
	}
}
