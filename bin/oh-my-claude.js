#!/usr/bin/env node
/**
 * oh-my-claude CLI entry point
 *
 * This is a thin wrapper that loads the compiled CLI.
 * If not compiled, it runs the TypeScript directly via Bun.
 */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distCli = join(__dirname, "..", "dist", "cli.js");
const srcCli = join(__dirname, "..", "src", "cli.ts");

async function main() {
  if (existsSync(distCli)) {
    // Use compiled version
    await import(distCli);
  } else if (existsSync(srcCli)) {
    // Fall back to source (requires Bun)
    const { spawn } = await import("node:child_process");
    const child = spawn("bun", ["run", srcCli, ...process.argv.slice(2)], {
      stdio: "inherit",
    });
    child.on("exit", (code) => process.exit(code ?? 0));
  } else {
    console.error("oh-my-claude not built. Run 'npm run build' first.");
    process.exit(1);
  }
}

main();
