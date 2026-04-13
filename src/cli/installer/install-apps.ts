/**
 * CLI dist, proxy, menubar (LFS-aware + download),
 * legacy cleanup, models registry, team cleanup
 */

import {
	existsSync,
	mkdirSync,
	writeFileSync,
	copyFileSync,
	cpSync,
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type { InstallContext } from './types';

export async function installApps(ctx: InstallContext): Promise<void> {
	// 4a2. Install CLI dist (keeps ~/.claude/oh-my-claude/dist/cli.js current)
	try {
		const cliDistDir = join(ctx.installDir, 'dist');
		if (!existsSync(cliDistDir)) {
			mkdirSync(cliDistDir, { recursive: true });
		}

		// bun build outputs to dist/cli/cli.js (preserves subdirectory structure)
		const builtCliPath = join(ctx.sourceDir, 'dist', 'cli', 'cli.js');
		const installedCliPath = join(cliDistDir, 'cli.js');
		if (existsSync(builtCliPath)) {
			copyFileSync(builtCliPath, installedCliPath);
		}

		// Also copy index.js (library entry point)
		const builtIndexPath = join(ctx.sourceDir, 'dist', 'index.js');
		const installedIndexPath = join(cliDistDir, 'index.js');
		if (existsSync(builtIndexPath)) {
			copyFileSync(builtIndexPath, installedIndexPath);
		}

		// Copy WASM assets
		const distDir = join(ctx.sourceDir, 'dist');
		if (existsSync(distDir)) {
			for (const file of readdirSync(distDir)) {
				if (file.endsWith('.wasm')) {
					copyFileSync(
						join(distDir, file),
						join(cliDistDir, file),
					);
				}
			}
		}
	} catch (error) {
		// Non-critical — CLI is served from npm global symlink primarily
		if (ctx.debug)
			console.log(`[DEBUG] Failed to install CLI dist: ${error}`);
	}

	// 4b. Install proxy server
	try {
		const proxyDir = join(ctx.installDir, 'dist', 'proxy');
		if (!existsSync(proxyDir)) {
			mkdirSync(proxyDir, { recursive: true });
		}

		const builtProxyDir = join(ctx.sourceDir, 'dist', 'proxy');
		if (existsSync(builtProxyDir)) {
			cpSync(builtProxyDir, proxyDir, { recursive: true });
		}
	} catch (error) {
		// Non-critical — proxy is opt-in
		if (ctx.debug) console.log(`[DEBUG] Failed to install proxy: ${error}`);
	}

	// 4b1. Remove legacy runtime artifacts from prior installs
	try {
		const legacyPaths = [
			join(ctx.installDir, 'dist', 'bridge-bus'),
			join(ctx.installDir, 'bridge-bus.pid'),
			join(ctx.installDir, 'bridge-state.json'),
			join(homedir(), '.claude', 'bridge.json'),
		];

		for (const legacyPath of legacyPaths) {
			if (!existsSync(legacyPath)) continue;
			rmSync(legacyPath, { recursive: true, force: true });
		}
	} catch (error) {
		if (ctx.debug)
			console.log(
				`[DEBUG] Failed to remove legacy runtime artifacts: ${error}`,
			);
	}

	// 4c. Install menubar app (Tauri app source for dev mode or building)
	try {
		const menubarDir = join(ctx.installDir, 'apps', 'menubar');

		if (!existsSync(menubarDir)) {
			mkdirSync(menubarDir, { recursive: true });
		}

		const srcMenubarDir = join(ctx.sourceDir, 'apps', 'menubar');
		if (existsSync(srcMenubarDir)) {
			// Track LFS pointer files found during copy — we'll download real
			// binaries from GitHub afterward.
			const lfsPointerFiles: Array<{
				relativePath: string;
				destPath: string;
			}> = [];

			// Copy source files, skip node_modules, target (build artifacts),
			// and Git LFS pointer files in builds/ (GitHub tarballs don't resolve LFS).
			cpSync(srcMenubarDir, menubarDir, {
				recursive: true,
				force: true,
				filter: (src) => {
					const basename = src.split(/[/\\]/).pop();
					if (
						basename === 'node_modules' ||
						basename === 'target'
					)
						return false;

					// Detect LFS pointer files in builds/ — they're not real binaries.
					// A real binary is >1KB; LFS pointers are ~130 bytes.
					if (
						src.includes(`builds${require('node:path').sep}`) &&
						basename &&
						!basename.includes('.')
					) {
						try {
							const stat = statSync(src);
							if (stat.isFile() && stat.size < 1024) {
								const head = readFileSync(src, {
									encoding: 'utf-8',
								}).slice(0, 40);
								if (
									head.startsWith(
										'version https://git-lfs',
									)
								) {
									// Compute relative path from menubar source dir for GitHub download
									const rel = src.slice(
										srcMenubarDir.length + 1,
									);
									const dest = join(menubarDir, rel);
									lfsPointerFiles.push({
										relativePath: `apps/menubar/${rel}`,
										destPath: dest,
									});
									if (ctx.debug)
										console.log(
											`[DEBUG] LFS pointer detected: ${src}`,
										);
									return false; // Skip copy — will download real binary below
								}
							}
						} catch {
							/* stat failed — include file */
						}
					}
					return true;
				},
			});

			// Download real binaries from GitHub for any LFS pointers found.
			// IMPORTANT: raw.githubusercontent.com does NOT resolve LFS — it serves
			// the pointer text. Use github.com/raw/ which 302-redirects to
			// media.githubusercontent.com for actual binary content.
			if (lfsPointerFiles.length > 0) {
				const GITHUB_LFS_BASE =
					'https://github.com/lgcyaxi/oh-my-claude/raw/dev';
				for (const { relativePath, destPath } of lfsPointerFiles) {
					const url = `${GITHUB_LFS_BASE}/${relativePath}`;
					try {
						console.log(
							`  Downloading menubar binary from GitHub...`,
						);
						if (ctx.debug)
							console.log(`[DEBUG] LFS download URL: ${url}`);

						const resp = await fetch(url, {
							signal: AbortSignal.timeout(60_000), // 60s for 8MB binary
							redirect: 'follow',
						});

						if (resp.ok) {
							const buffer = Buffer.from(
								await resp.arrayBuffer(),
							);

							// Validate: real binary should be >1MB, not a pointer or error page
							if (buffer.length < 1024) {
								console.log(
									`  ⚠ Downloaded file too small (${buffer.length} bytes), skipping`,
								);
								ctx.result.warnings.push(
									`Menubar binary download returned invalid data. Run 'oh-my-claude menubar --build' to build locally.`,
								);
								continue;
							}

							const destDir = dirname(destPath);
							if (!existsSync(destDir))
								mkdirSync(destDir, { recursive: true });
							writeFileSync(destPath, buffer, {
								mode: 0o755,
							});
							console.log(
								`  ✓ Downloaded menubar binary (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`,
							);
						} else {
							if (ctx.debug)
								console.log(
									`[DEBUG] LFS download failed (HTTP ${resp.status}): ${url}`,
								);
							ctx.result.warnings.push(
								`Menubar binary download failed (HTTP ${resp.status}). Run 'oh-my-claude menubar --build' to build locally.`,
							);
						}
					} catch (dlError) {
						if (ctx.debug)
							console.log(
								`[DEBUG] LFS binary download error: ${dlError}`,
							);
						ctx.result.warnings.push(
							`Menubar binary download failed. Run 'oh-my-claude menubar --build' to build locally.`,
						);
					}
				}
			}

			// Also clean up any pre-existing stale LFS pointer files that were
			// copied by older installers (before the LFS detection fix).
			const buildsDir = join(menubarDir, 'builds');
			if (existsSync(buildsDir)) {
				try {
					for (const platform of readdirSync(buildsDir)) {
						const platformDir = join(buildsDir, platform);
						const stat = statSync(platformDir);
						if (!stat.isDirectory()) continue;
						for (const file of readdirSync(platformDir)) {
							const filePath = join(platformDir, file);
							const fileStat = statSync(filePath);
							if (fileStat.isFile() && fileStat.size < 1024) {
								const head = readFileSync(filePath, {
									encoding: 'utf-8',
								}).slice(0, 40);
								if (
									head.startsWith(
										'version https://git-lfs',
									)
								) {
									unlinkSync(filePath);
									if (ctx.debug)
										console.log(
											`[DEBUG] Removed stale LFS pointer: ${filePath}`,
										);
								}
							}
						}
					}
				} catch {
					/* best-effort cleanup */
				}
			}

			// Install dependencies if package.json exists and node_modules is missing.
			// Skip if node_modules already exists (preserved across installs).
			const menubarPkgJson = join(menubarDir, 'package.json');
			const menubarNodeModules = join(menubarDir, 'node_modules');
			if (
				existsSync(menubarPkgJson) &&
				!existsSync(menubarNodeModules)
			) {
				try {
					execSync('bun install', {
						cwd: menubarDir,
						stdio: ctx.debug ? 'inherit' : 'ignore',
						timeout: 30_000,
					});
				} catch (installError) {
					// Non-critical — user can install manually
					if (ctx.debug)
						console.log(
							`[DEBUG] Failed to install menubar deps: ${installError}`,
						);
				}
			}
		}
	} catch (error) {
		// Non-critical — menubar is opt-in
		if (ctx.debug)
			console.log(`[DEBUG] Failed to install menubar app: ${error}`);
	}

	// 4e. Install models registry (provider/model catalog for menubar)
	try {
		const registrySrc = join(
			ctx.sourceDir,
			'src',
			'shared',
			'config',
			'models-registry.json',
		);
		// Also check dist/ in case we're running from an npm install
		const registrySrcDist = join(
			ctx.sourceDir,
			'dist',
			'config',
			'models-registry.json',
		);
		const registryDest = join(ctx.installDir, 'models-registry.json');

		const registrySource = existsSync(registrySrc)
			? registrySrc
			: existsSync(registrySrcDist)
				? registrySrcDist
				: null;
		if (registrySource) {
			copyFileSync(registrySource, registryDest);
		}
	} catch (error) {
		// Non-critical — menubar falls back to hardcoded defaults
		if (ctx.debug)
			console.log(
				`[DEBUG] Failed to install models registry: ${error}`,
			);
	}

	// 4f. Clean up removed team templates (deprecated in v2.1)
	try {
		const teamsDir = join(ctx.installDir, 'teams');
		if (existsSync(teamsDir)) {
			rmSync(teamsDir, { recursive: true, force: true });
		}
	} catch (error) {
		// Best-effort cleanup
		if (ctx.debug)
			console.log(
				`[DEBUG] Failed to clean up team templates: ${error}`,
			);
	}
}
