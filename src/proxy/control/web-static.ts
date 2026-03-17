/**
 * Static file serving for the web dashboard SPA
 *
 * Looks for files in two locations:
 * 1. dist/proxy/web/ (development, relative to project root)
 * 2. ~/.claude/oh-my-claude/proxy/web/ (production, installed location)
 */

import { existsSync } from 'fs';
import { join, extname } from 'path';
import { homedir } from 'os';

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

	// Check if file exists
	const file = Bun.file(filePath);
	if (file.size > 0) {
		const ext = extname(filePath);
		const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
		return new Response(file, {
			headers: {
				'content-type': contentType,
				'cache-control':
					ext === '.html'
						? 'no-cache'
						: 'public, max-age=31536000, immutable',
			},
		});
	}

	// SPA fallback — serve index.html for any unresolved path
	const indexFile = Bun.file(join(webDir, 'index.html'));
	return new Response(indexFile, {
		headers: {
			'content-type': 'text/html',
			'cache-control': 'no-cache',
		},
	});
}
