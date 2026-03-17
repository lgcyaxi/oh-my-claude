/**
 * Control API router — dispatches requests to endpoint handlers
 *
 * Session isolation: endpoints accept an optional `?session=ID` query
 * parameter. When present, operations target the in-memory session state.
 * When absent, operations target the global file-based state (backward compat).
 */

import {
	handleHealth,
	handleStatus,
	handleSessions,
	handleUsage,
} from './health';
import {
	handleSwitch,
	handleRevert,
	handleStop,
	registerShutdown,
} from './switch';
import { handleProviders, handleModels } from './providers';
import { handleResponse, handleStream } from './response';
import { handleInternalComplete, handleMemoryConfig } from './internal';
import { handleRegistryRequest } from './registry';
import { handleConfigRequest } from './config';
import { handleInstancesRequest } from './instances';
import { handleSessionsRequest } from './sessions/index';
import { handleMemoryRequest } from './memory/index';
import { handlePreferencesRequest } from './preferences';
import { jsonResponse } from './helpers';
import { serveWebAsset } from './web-static';

// Re-export registerShutdown for server.ts
export { registerShutdown } from './switch';

/** Forward a request to a per-session proxy's control port */
async function forwardToInstance(
	req: Request,
	controlPort: number,
	path: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	try {
		const targetUrl = `http://localhost:${controlPort}${path}`;
		const resp = await fetch(targetUrl, {
			method: req.method,
			headers: { 'content-type': 'application/json' },
			body: req.method === 'POST' ? await req.text() : undefined,
			signal: AbortSignal.timeout(5000),
		});
		const data = await resp.json();
		return jsonResponse(data, resp.status, corsHeaders);
	} catch {
		return jsonResponse(
			{ error: `Instance on port ${controlPort} unreachable` },
			502,
			corsHeaders,
		);
	}
}

export async function handleControl(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const path = url.pathname;
	const sessionId = url.searchParams.get('session') || undefined;

	const corsHeaders = {
		'access-control-allow-origin': '*',
		'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
		'access-control-allow-headers': 'content-type',
	};

	if (req.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders });
	}

	// Serve web dashboard SPA
	if (path === '/web' || path === '/web/') {
		return serveWebAsset('index.html');
	}
	if (path.startsWith('/web/')) {
		return serveWebAsset(path.slice(5));
	}
	// Favicon — inline SVG icon (no .ico file needed)
	if (path === '/favicon.ico' || path === '/favicon.svg') {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#6366f1"/><text x="16" y="21" font-size="12" font-family="system-ui" fill="white" text-anchor="middle" font-weight="bold">omc</text></svg>`;
		return new Response(svg, {
			headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' },
		});
	}
	// Root redirect to dashboard
	if (path === '/') {
		return Response.redirect(new URL('/web/', req.url).toString(), 302);
	}

	// Registry CRUD API
	if (path.startsWith('/api/registry')) {
		return handleRegistryRequest(req, path, corsHeaders);
	}

	// Instances aggregation API
	if (path === '/api/instances') {
		return handleInstancesRequest(req, corsHeaders);
	}

	// Instance control forwarding: /api/instances/:controlPort/(switch|revert|status)
	const instanceMatch = path.match(/^\/api\/instances\/(\d+)\/(switch|revert|status)$/);
	if (instanceMatch) {
		const [, targetPort, action] = instanceMatch;
		return forwardToInstance(req, Number(targetPort), `/${action}`, corsHeaders);
	}

	// Config API
	if (path.startsWith('/api/config')) {
		return handleConfigRequest(req, path, corsHeaders);
	}

	// Sessions API (browse conversation history)
	if (path.startsWith('/api/sessions')) {
		return handleSessionsRequest(req, path, corsHeaders);
	}

	// Memory API (browse and edit memories)
	if (path.startsWith('/api/memory')) {
		return handleMemoryRequest(req, path, corsHeaders);
	}

	// Preferences API
	if (path.startsWith('/api/preferences')) {
		return handlePreferencesRequest(req, path, corsHeaders);
	}

	const sessionTag = sessionId
		? ` [s:${sessionId.slice(0, 8)}]`
		: ' [global]';

	try {
		switch (path) {
			case '/health':
				return await handleHealth(corsHeaders);

			case '/status':
				return await handleStatus(sessionId, corsHeaders);

			case '/sessions':
				return handleSessions(corsHeaders);

			case '/usage':
				return handleUsage(corsHeaders);

			case '/providers':
				return await handleProviders(corsHeaders);

			case '/response':
				return await handleResponse(url, corsHeaders);

			case '/stream':
				return await handleStream(url, corsHeaders);

			case '/switch':
				return await handleSwitch(
					req,
					sessionId,
					sessionTag,
					corsHeaders,
				);

			case '/revert':
				return await handleRevert(
					req,
					sessionId,
					sessionTag,
					corsHeaders,
				);

			case '/models':
				return await handleModels(url, corsHeaders);

			case '/stop':
				return await handleStop(req, corsHeaders);

			case '/internal/complete':
				return await handleInternalComplete(req, corsHeaders);

			case '/internal/memory-config':
				return await handleMemoryConfig(req, corsHeaders);

			default:
				return jsonResponse(
					{
						error: 'Not found',
						endpoints: [
							'/health',
							'/status',
							'/sessions',
							'/usage',
							'/providers',
							'/response',
							'/stream',
							'/switch',
							'/revert',
							'/models',
							'/stop',
							'/internal/complete',
							'/internal/memory-config',
						'/api/sessions',
						],
						hint: 'Add ?session=ID for session-scoped operations',
					},
					404,
					corsHeaders,
				);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[control] Error: ${message}`);
		return jsonResponse({ error: message }, 500, corsHeaders);
	}
}
