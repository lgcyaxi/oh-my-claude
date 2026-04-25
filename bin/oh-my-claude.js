#!/usr/bin/env node
/**
 * oh-my-claude CLI entry point.
 *
 * Loads the compiled CLI at dist/cli/cli.js. If dist/ is missing we fail fast
 * with an actionable error instead of silently spawning the TS source — the
 * source path caused cryptic zod/parser errors on fresh bun-global installs
 * from the GitHub dev tarball (see docs/changelog/v2.2.x.md, beta.6).
 *
 * For local development (e.g. via `npm link`), set
 *   OMC_ALLOW_SOURCE_FALLBACK=1
 * to re-enable the legacy `bun run src/cli/cli.ts` fallback.
 */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");
const distCli = join(pkgRoot, "dist", "cli", "cli.js");
const srcCli = join(pkgRoot, "src", "cli", "cli.ts");

function allowSourceFallback() {
	const v = process.env.OMC_ALLOW_SOURCE_FALLBACK;
	return v === "1" || v === "true" || v === "yes";
}

function printMissingDistError() {
	const lines = [
		"",
		"oh-my-claude is not built: dist/cli/cli.js was not found.",
		"",
		`  package dir: ${pkgRoot}`,
		"",
		"This usually means the install skipped the `prepare` lifecycle (e.g.",
		"`--ignore-scripts`, a sandboxed installer, or a cached tarball). Fix it",
		"by building from the installed directory:",
		"",
		`  cd "${pkgRoot}" && bun run build:all`,
		"",
		"If `bun` is not installed yet, grab it first:",
		"  curl -fsSL https://bun.com/install | bash     # macOS / Linux / WSL",
		"  powershell -c \"irm bun.com/install.ps1 | iex\"  # Windows",
		"",
		"Then reinstall:  bun add -g @lgcyaxi/oh-my-claude@<ref>",
		"",
		"Developers working from a linked checkout can opt into the TS fallback",
		"with:  OMC_ALLOW_SOURCE_FALLBACK=1 omc ...",
		"",
	];
	process.stderr.write(lines.join("\n"));
}

async function main() {
	if (existsSync(distCli)) {
		// pathToFileURL for Windows compatibility
		const distCliUrl = pathToFileURL(distCli).href;
		await import(distCliUrl);
		return;
	}

	if (allowSourceFallback() && existsSync(srcCli)) {
		const { spawn } = await import("node:child_process");
		const child = spawn("bun", ["run", srcCli, ...process.argv.slice(2)], {
			stdio: "inherit",
			shell: process.platform === "win32",
		});
		child.on("exit", (code) => process.exit(code != null ? code : 0));
		return;
	}

	printMissingDistError();
	process.exit(1);
}

main();
