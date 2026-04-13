#!/usr/bin/env bun
/**
 * oh-my-claude Dashboard Server (control-only)
 *
 * Lightweight server that serves only the web dashboard and read-only APIs:
 *   - Web UI at /web/
 *   - Sessions API at /api/sessions
 *   - Config, Registry, Instances APIs
 *   - Health endpoint
 *
 * No proxy port — this is NOT used for ANTHROPIC_BASE_URL routing.
 *
 * Usage:
 *   bun run src/proxy/dashboard.ts
 *   bun run src/proxy/dashboard.ts --port 18920
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { handleControl } from './control';
import { registerShutdown } from './control/switch';

const DEFAULT_PORT = 18920;

/**
 * Load API key environment variables from ~/.zshrc.api.
 * The dashboard runs as a standalone daemon that may not inherit the user's
 * shell profile, so we load API keys explicitly at startup.
 */
function loadApiEnvFile(): void {
	try {
		const envFile = join(homedir(), '.zshrc.api');
		if (!existsSync(envFile)) return;

		const content = readFileSync(envFile, 'utf-8');
		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const match = trimmed.match(/^export\s+([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (!match) continue;
			const key = match[1]!;
			let value = match[2]!;
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			if (!process.env[key]) {
				process.env[key] = value;
			}
		}
	} catch {
		// Best-effort — don't prevent dashboard from starting
	}
}

function parsePort(): number {
	const args = process.argv.slice(2);
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--port' && args[i + 1]) {
			return parseInt(args[i + 1]!, 10);
		}
	}
	return DEFAULT_PORT;
}

async function main() {
	loadApiEnvFile();
	const port = parsePort();

	const server = Bun.serve({
		port,
		fetch: handleControl,
		error(error: Error): Response {
			console.error(`[dashboard] Error: ${error.message}`);
			return new Response(JSON.stringify({ error: error.message }), {
				status: 500,
				headers: { 'content-type': 'application/json' },
			});
		},
	});

	console.error('oh-my-claude Dashboard');
	console.error(`  URL: http://localhost:${server.port}/web/`);

	const shutdown = () => {
		console.error('\n[dashboard] Shutting down...');
		server.stop();
		process.exit(0);
	};

	registerShutdown(shutdown);
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}

main().catch((error) => {
	console.error('Failed to start dashboard:', error);
	process.exit(1);
});
