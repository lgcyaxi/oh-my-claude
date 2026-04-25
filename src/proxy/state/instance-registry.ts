/**
 * Per-session proxy instance registry
 *
 * Each proxy instance registers itself on startup and deregisters on shutdown.
 * The web dashboard reads this file to discover and aggregate all running proxies.
 *
 * File: ~/.claude/oh-my-claude/proxy-instances.json
 *
 * Entries auto-expire after 5 minutes without a heartbeat.
 * Each proxy calls heartbeat() every 60 seconds to stay registered.
 */

import {
	readFileSync,
	writeFileSync,
	existsSync,
	mkdirSync,
	openSync,
	closeSync,
	unlinkSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface ProxyInstance {
	/** Unique session identifier */
	sessionId: string;
	/** Data port (where Claude Code connects) */
	port: number;
	/** Control port (where dashboard/API queries go) */
	controlPort: number;
	/** Process ID */
	pid: number;
	/** When this instance started (ISO timestamp) */
	startedAt: string;
	/** Last heartbeat (ISO timestamp) */
	lastHeartbeat: string;
	/** Working directory of the session */
	cwd?: string;
	/** Pre-switched provider (if any) */
	provider?: string;
	/** Pre-switched model (if any) */
	model?: string;
}

const REGISTRY_DIR = join(homedir(), '.claude', 'oh-my-claude');
const REGISTRY_FILE = join(REGISTRY_DIR, 'proxy-instances.json');
const LOCK_FILE = join(REGISTRY_DIR, 'proxy-instances.lock');

/** Stale instance TTL: 5 minutes without heartbeat */
const STALE_TTL_MS = 5 * 60 * 1000;

/**
 * Acquire a tiny advisory lock on the instance registry to serialize
 * read-modify-write cycles across concurrent proxy processes.
 *
 * Uses `openSync(path, 'wx')` (O_CREAT|O_EXCL) which atomically fails when
 * another process already holds the lock. We retry with a small jitter to
 * absorb typical RMW contention (~ms) without spinning.
 *
 * The lock auto-expires after `LOCK_STALE_MS` in case a holder crashes
 * mid-operation: a stale lock is unlinked and the caller retries.
 */
const LOCK_RETRIES = 10;
const LOCK_BASE_BACKOFF_MS = 20;
const LOCK_STALE_MS = 5_000;

function sleepBlockingMs(ms: number): void {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		// Intentional busy-wait — these are all sub-second waits during
		// contention; `await` is not an option because every public RMW
		// function in this file is synchronous (called from request hot paths).
	}
}

function acquireRegistryLock(): number | null {
	for (let i = 0; i < LOCK_RETRIES; i++) {
		try {
			if (!existsSync(REGISTRY_DIR)) {
				mkdirSync(REGISTRY_DIR, { recursive: true });
			}
			return openSync(LOCK_FILE, 'wx');
		} catch (err: unknown) {
			const code = (err as NodeJS.ErrnoException | undefined)?.code;
			if (code !== 'EEXIST') {
				// Permission / I/O problem — give up; fall back to lockless RMW
				// which is still a correctness improvement over the previous
				// behaviour (readInstances already self-heals stale entries).
				return null;
			}
			// Check for stale lock: hold time > LOCK_STALE_MS means the prior
			// holder likely crashed. Remove and retry.
			try {
				const stat = require('fs').statSync(LOCK_FILE) as {
					mtimeMs: number;
				};
				if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
					try {
						unlinkSync(LOCK_FILE);
					} catch {
						/* ignore */
					}
					continue;
				}
			} catch {
				// statSync races with another unlink; just retry.
			}
			sleepBlockingMs(LOCK_BASE_BACKOFF_MS + Math.random() * LOCK_BASE_BACKOFF_MS);
		}
	}
	return null;
}

function releaseRegistryLock(fd: number | null): void {
	if (fd === null) return;
	try {
		closeSync(fd);
	} catch {
		// Ignore
	}
	try {
		unlinkSync(LOCK_FILE);
	} catch {
		// Already removed or inaccessible — nothing to do.
	}
}

/**
 * Run a read-modify-write closure under the advisory lock. If the lock
 * cannot be acquired within `LOCK_RETRIES`, falls back to running the
 * closure unlocked (best-effort — preserves prior behaviour instead of
 * failing outright).
 */
function withRegistryLock<T>(fn: () => T): T {
	const fd = acquireRegistryLock();
	try {
		return fn();
	} finally {
		releaseRegistryLock(fd);
	}
}

/** Check if a PID is alive */
function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Read all registered instances, filtering out stale and dead entries.
 *
 * Lock-free: returns the in-memory filtered view. Does NOT persist the
 * cleaned list back to disk — that is the job of `pruneInstances()`, which
 * runs under the registry advisory lock from dedicated RMW call sites
 * (register/heartbeat/deregister). Splitting read vs prune eliminates an
 * RMW race where two concurrent dashboard reads both saw different "stale"
 * sets and raced to write disjoint cleaned lists.
 */
export function readInstances(): ProxyInstance[] {
	return readInstancesLockFree();
}

/** Lock-free filtered read; does not write back. */
function readInstancesLockFree(): ProxyInstance[] {
	if (!existsSync(REGISTRY_FILE)) return [];
	try {
		const data = JSON.parse(readFileSync(REGISTRY_FILE, 'utf-8'));
		const instances: ProxyInstance[] = Array.isArray(data) ? data : [];
		const now = Date.now();
		return instances.filter((i) => {
			const heartbeat = new Date(i.lastHeartbeat).getTime();
			if (now - heartbeat >= STALE_TTL_MS) return false;
			if (!isPidAlive(i.pid)) return false;
			return true;
		});
	} catch {
		return [];
	}
}

/**
 * Prune stale/dead entries under the advisory lock. Called by register /
 * heartbeat / deregister. Callers that only need the current live set should
 * use `readInstances()` instead — writing back from pure reads is what
 * caused the beta.5-era RMW race.
 */
function pruneInstances(): ProxyInstance[] {
	const raw = existsSync(REGISTRY_FILE)
		? (() => {
				try {
					return JSON.parse(readFileSync(REGISTRY_FILE, 'utf-8'));
				} catch {
					return [];
				}
			})()
		: [];
	const instances: ProxyInstance[] = Array.isArray(raw) ? raw : [];
	const now = Date.now();
	const alive = instances.filter((i) => {
		const heartbeat = new Date(i.lastHeartbeat).getTime();
		if (now - heartbeat >= STALE_TTL_MS) return false;
		if (!isPidAlive(i.pid)) return false;
		return true;
	});
	if (alive.length < instances.length) {
		writeInstances(alive);
	}
	return alive;
}

/** Write instances to disk (atomic via rename) */
function writeInstances(instances: ProxyInstance[]): void {
	mkdirSync(REGISTRY_DIR, { recursive: true });
	const tmpPath = REGISTRY_FILE + '.tmp';
	writeFileSync(tmpPath, JSON.stringify(instances, null, '\t') + '\n', 'utf-8');
	// Bun supports renameSync, Node.js too
	const { renameSync } = require('fs');
	renameSync(tmpPath, REGISTRY_FILE);
}

/** Register a new proxy instance */
export function registerInstance(instance: Omit<ProxyInstance, 'lastHeartbeat'>): void {
	withRegistryLock(() => {
		const instances = pruneInstances();
		// Remove any existing entry with same sessionId or port
		const filtered = instances.filter(
			(i) => i.sessionId !== instance.sessionId && i.port !== instance.port,
		);
		filtered.push({
			...instance,
			lastHeartbeat: new Date().toISOString(),
		});
		writeInstances(filtered);
	});
}

/** Deregister a proxy instance */
export function deregisterInstance(sessionId: string): void {
	withRegistryLock(() => {
		const instances = pruneInstances();
		writeInstances(instances.filter((i) => i.sessionId !== sessionId));
	});
}

/** Update heartbeat timestamp for an instance */
export function heartbeatInstance(sessionId: string): void {
	withRegistryLock(() => {
		const instances = pruneInstances();
		const instance = instances.find((i) => i.sessionId === sessionId);
		if (instance) {
			instance.lastHeartbeat = new Date().toISOString();
			writeInstances(instances);
		}
	});
}

/** Start a heartbeat interval that keeps this instance registered. Returns cleanup fn. */
export function startHeartbeat(sessionId: string, intervalMs = 60_000): () => void {
	const timer = setInterval(() => heartbeatInstance(sessionId), intervalMs);
	return () => clearInterval(timer);
}
