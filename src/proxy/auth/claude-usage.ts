/**
 * Claude subscription usage -- active polling via OAuth token.
 *
 * Reads OAuth token from:
 * 1. macOS Keychain (security find-generic-password -a $USER -w -s "Claude Code-credentials")
 * 2. File fallback: ~/.claude/.credentials.json
 *
 * Then calls: GET https://api.anthropic.com/api/oauth/usage
 * Headers: Authorization: Bearer {token}, anthropic-beta: oauth-2025-04-20
 *
 * Response format: { five_hour: { utilization: number, resets_at: string }, seven_day: { utilization: number, resets_at: string } }
 * The utilization values are 0-100 (percentage).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { execSync } from 'node:child_process';

interface ClaudeCredentials {
	claudeAiOauth?: {
		accessToken: string;
		refreshToken?: string;
		expiresAt?: number;
	};
}

export interface UsageResponse {
	five_hour: { utilization: number; resets_at?: string };
	seven_day: { utilization: number; resets_at?: string };
}

const CACHE_PATH = join(
	homedir(),
	'.claude',
	'oh-my-claude',
	'cache',
	'api_usage.json',
);

/** Track rate-limit backoff to avoid wasting requests */
let rateLimitedUntil = 0;

/**
 * Get OAuth token from macOS Keychain or credentials file
 */
export function getClaudeOAuthToken(): string | null {
	// 1. Try macOS Keychain
	if (platform() === 'darwin') {
		try {
			const user = process.env.USER || 'user';
			const output = execSync(
				`security find-generic-password -a "${user}" -w -s "Claude Code-credentials"`,
				{
					encoding: 'utf-8',
					timeout: 3000,
					stdio: ['pipe', 'pipe', 'pipe'],
				},
			).trim();
			if (output) {
				const creds: ClaudeCredentials = JSON.parse(output);
				if (creds.claudeAiOauth?.accessToken) {
					return creds.claudeAiOauth.accessToken;
				}
			}
		} catch {
			// Keychain access failed -- try file fallback
		}
	}

	// 2. File fallback: CLAUDE_CONFIG_DIR or ~/.claude/.credentials.json
	const configDir = process.env.CLAUDE_CONFIG_DIR;
	const credPaths = [
		...(configDir ? [join(configDir, '.credentials.json')] : []),
		join(homedir(), '.claude', '.credentials.json'),
	];
	for (const credPath of credPaths) {
		try {
			if (existsSync(credPath)) {
				const content = readFileSync(credPath, 'utf-8');
				const creds: ClaudeCredentials = JSON.parse(content);
				if (creds.claudeAiOauth?.accessToken) {
					return creds.claudeAiOauth.accessToken;
				}
			}
		} catch {
			// File read failed, try next
		}
	}

	return null;
}

/**
 * Fetch usage from Anthropic API directly
 */
export async function fetchClaudeUsage(
	timeoutMs = 3000,
): Promise<UsageResponse | null> {
	// Skip if we're in a rate-limit backoff window
	if (Date.now() < rateLimitedUntil) return null;

	const token = getClaudeOAuthToken();
	if (!token) return null;

	try {
		const resp = await fetch('https://api.anthropic.com/api/oauth/usage', {
			headers: {
				Authorization: `Bearer ${token}`,
				'anthropic-beta': 'oauth-2025-04-20',
				'User-Agent': 'claude-code/1.0',
			},
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (resp.status === 429) {
			// Use server-provided Retry-After, fallback to 60s
			const retryAfter = parseInt(
				resp.headers.get('retry-after') || '60',
				10,
			);
			rateLimitedUntil = Date.now() + retryAfter * 1000;
			return null;
		}

		if (!resp.ok) return null;
		return (await resp.json()) as UsageResponse;
	} catch {
		return null;
	}
}

/**
 * Fetch and write to cache file
 */
export async function pollAndCacheClaudeUsage(
	timeoutMs = 5000,
): Promise<boolean> {
	const data = await fetchClaudeUsage(timeoutMs);
	if (!data?.five_hour) return false;

	try {
		const cacheDir = join(homedir(), '.claude', 'oh-my-claude', 'cache');
		mkdirSync(cacheDir, { recursive: true });
		writeFileSync(
			CACHE_PATH,
			JSON.stringify({
				timestamp: Date.now(),
				five_hour: data.five_hour,
				seven_day: data.seven_day,
			}),
			'utf-8',
		);
		return true;
	} catch {
		return false;
	}
}
