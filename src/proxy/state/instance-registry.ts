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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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
	/** Pre-switched provider (if any) */
	provider?: string;
	/** Pre-switched model (if any) */
	model?: string;
}

const REGISTRY_DIR = join(homedir(), '.claude', 'oh-my-claude');
const REGISTRY_FILE = join(REGISTRY_DIR, 'proxy-instances.json');

/** Stale instance TTL: 5 minutes without heartbeat */
const STALE_TTL_MS = 5 * 60 * 1000;

/** Read all registered instances, filtering out stale entries */
export function readInstances(): ProxyInstance[] {
	if (!existsSync(REGISTRY_FILE)) return [];
	try {
		const data = JSON.parse(readFileSync(REGISTRY_FILE, 'utf-8'));
		const instances: ProxyInstance[] = Array.isArray(data) ? data : [];
		const now = Date.now();
		// Filter out stale entries
		return instances.filter((i) => {
			const heartbeat = new Date(i.lastHeartbeat).getTime();
			return now - heartbeat < STALE_TTL_MS;
		});
	} catch {
		return [];
	}
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
	const instances = readInstances();
	// Remove any existing entry with same sessionId or port
	const filtered = instances.filter(
		(i) => i.sessionId !== instance.sessionId && i.port !== instance.port,
	);
	filtered.push({
		...instance,
		lastHeartbeat: new Date().toISOString(),
	});
	writeInstances(filtered);
}

/** Deregister a proxy instance */
export function deregisterInstance(sessionId: string): void {
	const instances = readInstances();
	writeInstances(instances.filter((i) => i.sessionId !== sessionId));
}

/** Update heartbeat timestamp for an instance */
export function heartbeatInstance(sessionId: string): void {
	const instances = readInstances();
	const instance = instances.find((i) => i.sessionId === sessionId);
	if (instance) {
		instance.lastHeartbeat = new Date().toISOString();
		writeInstances(instances);
	}
}

/** Start a heartbeat interval that keeps this instance registered. Returns cleanup fn. */
export function startHeartbeat(sessionId: string, intervalMs = 60_000): () => void {
	const timer = setInterval(() => heartbeatInstance(sessionId), intervalMs);
	return () => clearInterval(timer);
}
