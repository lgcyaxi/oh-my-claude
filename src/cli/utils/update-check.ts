/**
 * Non-blocking auto-update check — two-phase design for zero CLI latency.
 *
 * Phase 1: printUpdateBannerIfCached() — sync, reads from previous run's cache
 * Phase 2: scheduleUpdateCheck() — spawns detached child, updates cache for next run
 *
 * Cache file: ~/.claude/oh-my-claude/.update-check.json
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { isBetaInstallation, getBetaChannelInfo } from '../installer/beta-channel';

const CACHE_DIR = join(homedir(), '.claude', 'oh-my-claude');
const CACHE_FILE = join(CACHE_DIR, '.update-check.json');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UpdateCache {
	checkedAt: string;
	currentVersion: string;
	latestVersion?: string;
	latestRef?: string;
	updateAvailable: boolean;
	isBeta: boolean;
}

/* ── Phase 1: Sync cache read + banner ── */

function readCache(): UpdateCache | null {
	try {
		if (!existsSync(CACHE_FILE)) return null;
		const raw = readFileSync(CACHE_FILE, 'utf-8');
		return JSON.parse(raw) as UpdateCache;
	} catch {
		return null;
	}
}

/** Remove stale update cache (e.g. after a successful update) */
export function clearCache(): void {
	try {
		if (existsSync(CACHE_FILE)) unlinkSync(CACHE_FILE);
	} catch { /* non-critical */ }
}

/**
 * Sync — print update banner from previous run's cache.
 * Call early in CLI startup. Returns true if banner was shown.
 */
export function printUpdateBannerIfCached(): boolean {
	const cache = readCache();
	if (!cache?.updateAvailable) return false;

	if (cache.isBeta) {
		// Re-validate: the user may have already updated since the cache was written
		const betaInfo = getBetaChannelInfo();
		const betaRef = betaInfo?.ref ?? '';
		const latestRef = cache.latestRef ?? '';
		if (betaRef && latestRef && (betaRef.startsWith(latestRef) || latestRef.startsWith(betaRef))) {
			// Already up-to-date — clear stale cache
			clearCache();
			return false;
		}

		process.stderr.write(
			`\n  Update available: newer commit on dev branch (${latestRef})\n` +
			`  Run: omc update --beta\n\n`,
		);
	} else {
		process.stderr.write(
			`\n  Update available: ${cache.currentVersion} → ${cache.latestVersion}\n` +
			`  Run: omc update\n\n`,
		);
	}
	return true;
}

/* ── Phase 2: Detached child process check ── */

/**
 * Fire-and-forget background update check.
 * Spawns a detached child process so the main CLI can exit immediately.
 * The child writes cache results and exits on its own.
 */
export function scheduleUpdateCheck(currentVersion: string): void {
	// Check if cache is still fresh (sync — fast)
	const cache = readCache();
	if (cache) {
		const age = Date.now() - new Date(cache.checkedAt).getTime();
		if (age < CHECK_INTERVAL_MS) return; // Still fresh
	}

	// Spawn detached child to run the check
	const { spawn } = require('node:child_process') as typeof import('node:child_process');
	const script = `
		const isBeta = ${JSON.stringify(isBetaInstallation())};
		const currentVersion = ${JSON.stringify(currentVersion)};
		const betaRef = ${JSON.stringify(getBetaChannelInfo()?.ref ?? '')};
		const cacheFile = ${JSON.stringify(CACHE_FILE)};
		const cacheDir = ${JSON.stringify(CACHE_DIR)};

		async function run() {
			const fs = require('node:fs');
			const writeCache = (data) => {
				try {
					if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
					fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
				} catch {}
			};

			try {
				if (isBeta) {
					const ctrl = new AbortController();
					const t = setTimeout(() => ctrl.abort(), 5000);
					const r = await fetch('https://api.github.com/repos/lgcyaxi/oh-my-claude/commits/dev', {
						headers: { 'user-agent': 'oh-my-claude-update-check' },
						signal: ctrl.signal,
					});
					clearTimeout(t);
					if (!r.ok) return writeCache({ checkedAt: new Date().toISOString(), currentVersion, updateAvailable: false, isBeta: true });
					const d = await r.json();
					const latestRef = d.sha ? d.sha.substring(0, 7) : '';
					const updateAvailable = latestRef && !betaRef.startsWith(latestRef) && !latestRef.startsWith(betaRef);
					writeCache({ checkedAt: new Date().toISOString(), currentVersion, latestRef, updateAvailable, isBeta: true });
				} else {
					const ctrl = new AbortController();
					const t = setTimeout(() => ctrl.abort(), 5000);
					const r = await fetch('https://registry.npmjs.org/@lgcyaxi/oh-my-claude/latest', { signal: ctrl.signal });
					clearTimeout(t);
					if (!r.ok) return writeCache({ checkedAt: new Date().toISOString(), currentVersion, updateAvailable: false, isBeta: false });
					const d = await r.json();
					const latestVersion = d.version || '';
					const norm = (v) => v.replace(/^v/, '').split('-')[0].split('.').map(Number);
					const cur = norm(currentVersion);
					const lat = norm(latestVersion);
					let updateAvailable = false;
					for (let i = 0; i < 3; i++) {
						if ((lat[i] || 0) > (cur[i] || 0)) { updateAvailable = true; break; }
						if ((lat[i] || 0) < (cur[i] || 0)) break;
					}
					writeCache({ checkedAt: new Date().toISOString(), currentVersion, latestVersion, updateAvailable, isBeta: false });
				}
			} catch {}
		}
		run();
	`;

	try {
		const child = spawn(process.execPath, ['--eval', script], {
			detached: true,
			stdio: 'ignore',
			windowsHide: true,
		});
		child.unref();
	} catch {
		// Silent fail — update check is non-critical
	}
}
