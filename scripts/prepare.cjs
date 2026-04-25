#!/usr/bin/env node
/**
 * npm/bun `prepare` lifecycle hook.
 *
 * Runs in two contexts:
 *   1. During `npm publish` / `npm pack`     -> we build dist/ so the published
 *                                              tarball contains ready-to-run JS.
 *   2. During `npm install <git-tarball>` or `bun add <git-tarball>`
 *                                             -> the GitHub tarball ships
 *                                              source only (dist/ is gitignored).
 *                                              We rebuild on the user's machine.
 *
 * Prerequisites on the user's machine:
 *   - `bun` must be available in PATH. We intentionally do NOT try to build
 *     with node/tsc because our build graph (bun build for the runtime, wasm
 *     copy, vite for the web dashboard) requires bun semantics.
 *
 * Escape hatches:
 *   - `OMC_SKIP_PREPARE=1`  skip entirely (useful in CI or repo dev flows).
 *   - If dist/cli/cli.js already exists, we also skip (published tarballs).
 */

"use strict";

const { existsSync } = require("node:fs");
const { join, dirname } = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = dirname(__dirname);
// Keep this path in sync with DIST_MARKER_REL in src/cli/utils/paths.ts —
// all three of update.ts, beta-channel.ts, and this script must agree on
// the canonical "built" marker (regression from beta.5 that beta.6 and
// beta.8 both touched).
const DIST_MARKER = join(ROOT, "dist", "cli", "cli.js");

function log(msg) {
	process.stdout.write(`[oh-my-claude prepare] ${msg}\n`);
}

function warn(msg) {
	process.stderr.write(`[oh-my-claude prepare] ${msg}\n`);
}

function skipEnvRequested() {
	const v = process.env.OMC_SKIP_PREPARE;
	return v === "1" || v === "true" || v === "yes";
}

function bunAvailable() {
	const res = spawnSync("bun", ["--version"], {
		stdio: "ignore",
		shell: process.platform === "win32",
	});
	return res.status === 0;
}

function runBunBuild() {
	log("running `bun run build:all`...");
	const res = spawnSync("bun", ["run", "build:all"], {
		cwd: ROOT,
		stdio: "inherit",
		shell: process.platform === "win32",
	});
	return res.status ?? 1;
}

function printBunMissing() {
	warn("");
	warn("`bun` was not found in PATH.");
	warn("");
	warn("oh-my-claude requires the Bun runtime to build and run. Install it");
	warn("with one of:");
	warn("  macOS / Linux / WSL:  curl -fsSL https://bun.com/install | bash");
	warn("  Windows (PowerShell): powershell -c \"irm bun.com/install.ps1 | iex\"");
	warn("  npm:                  npm install -g bun");
	warn("  winget:               winget install Oven-sh.Bun");
	warn("");
	warn("After installing, re-run:  bun add -g @lgcyaxi/oh-my-claude@<ref>");
	warn("Or in this directory:      OMC_SKIP_PREPARE=1  # then manually `bun run build:all`");
	warn("");
}

function main() {
	if (skipEnvRequested()) {
		log("OMC_SKIP_PREPARE set; skipping build.");
		return 0;
	}

	if (existsSync(DIST_MARKER)) {
		log("dist/cli/cli.js already present; skipping build.");
		return 0;
	}

	if (!bunAvailable()) {
		printBunMissing();
		return 1;
	}

	const code = runBunBuild();
	if (code !== 0) {
		warn(`build failed (exit ${code}).`);
		return code;
	}

	if (!existsSync(DIST_MARKER)) {
		warn("build reported success but dist/cli/cli.js is still missing.");
		return 1;
	}

	log("build complete.");
	return 0;
}

process.exit(main());
