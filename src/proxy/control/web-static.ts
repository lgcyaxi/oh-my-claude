/**
 * Static file serving for the web dashboard SPA
 *
 * Looks for files in two locations:
 * 1. dist/proxy/web/ (development, relative to project root)
 * 2. ~/.claude/oh-my-claude/proxy/web/ (production, installed location)
 *
 * index.html is read into memory once to avoid EMFILE (too many open files)
 * on Windows — Bun.file() opens a new FD per request, and the SPA fallback
 * fires on every unmatched path.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';

const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
};

/** Candidate directories for web assets */
function getWebDirs(): string[] {
	const dirs: string[] = [];

	// Dev: relative to CWD
	dirs.push(join(process.cwd(), 'dist', 'proxy', 'web'));

	// Production: installed location (dist/proxy/web/ inside install dir)
	const installed = join(
		homedir(),
		'.claude',
		'oh-my-claude',
		'dist',
		'proxy',
		'web',
	);
	dirs.push(installed);

	// Also check relative to the server.js bundle location
	if (typeof __dirname !== 'undefined') {
		dirs.push(join(__dirname, 'web'));
	}

	return dirs;
}

let cachedWebDir: string | null = null;

function resolveWebDir(): string | null {
	if (cachedWebDir !== null) return cachedWebDir;
	for (const dir of getWebDirs()) {
		if (existsSync(join(dir, 'index.html'))) {
			cachedWebDir = dir;
			return dir;
		}
	}
	return null;
}

/**
 * Cached index.html buffer — read once into memory to avoid opening a new
 * file descriptor on every SPA fallback request (prevents EMFILE on Windows).
 */
let cachedIndexHtml: Buffer | null = null;

function getIndexHtml(webDir: string): Buffer {
	if (cachedIndexHtml !== null) return cachedIndexHtml;
	cachedIndexHtml = readFileSync(join(webDir, 'index.html'));
	return cachedIndexHtml;
}

export function serveWebAsset(assetPath: string): Response {
	const webDir = resolveWebDir();
	if (!webDir) {
		return new Response(
			'<html><body><h1>Dashboard not built</h1><p>Run <code>bun run build:web</code> to build the dashboard.</p></body></html>',
			{
				status: 404,
				headers: { 'content-type': 'text/html' },
			},
		);
	}

	// Normalize path — prevent directory traversal
	const normalized = assetPath.replace(/\.\./g, '').replace(/^\/+/, '');
	const filePath = join(webDir, normalized);

	// Serve index.html directly from memory cache
	if (normalized === 'index.html' || normalized === '') {
		return new Response(getIndexHtml(webDir), {
			headers: {
				'content-type': 'text/html',
				'cache-control': 'no-cache',
			},
		});
	}

	// Serve static assets from disk — use existsSync + readFileSync to avoid
	// Bun.file() FD leaks (each Bun.file() holds an open FD until Response is consumed)
	if (existsSync(filePath)) {
		const ext = extname(filePath);
		const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
		return new Response(readFileSync(filePath), {
			headers: {
				'content-type': contentType,
				'cache-control':
					ext === '.html'
						? 'no-cache'
						: 'public, max-age=31536000, immutable',
			},
		});
	}

	// SPA fallback — serve cached index.html for any unresolved path
	return new Response(getIndexHtml(webDir), {
		headers: {
			'content-type': 'text/html',
			'cache-control': 'no-cache',
		},
	});
}
