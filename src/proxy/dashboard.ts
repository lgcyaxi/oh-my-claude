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

import { handleControl } from './control';
import { registerShutdown } from './control/switch';

const DEFAULT_PORT = 18920;

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
