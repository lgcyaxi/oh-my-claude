/**
 * Copy sql-wasm.wasm to dist/mcp/ after build.
 *
 * Bun may use global cache instead of node_modules/, so we resolve
 * the WASM file path via multiple strategies for robustness.
 */
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const WASM_FILENAME = "sql-wasm.wasm";
const TARGET_DIR = join(import.meta.dir, "..", "dist", "mcp");
const TARGET_PATH = join(TARGET_DIR, WASM_FILENAME);

function findWasm(): string | null {
  // Strategy 1: node_modules (works when Bun creates symlinks)
  const nodeModulesPath = join(
    import.meta.dir,
    "..",
    "node_modules",
    "sql.js-fts5",
    "dist",
    WASM_FILENAME
  );
  if (existsSync(nodeModulesPath)) return nodeModulesPath;

  // Strategy 2: require.resolve (works in most runtimes)
  try {
    const resolved = require.resolve(`sql.js-fts5/dist/${WASM_FILENAME}`);
    if (resolved && existsSync(resolved)) return resolved;
  } catch {
    // Not resolvable
  }

  // Strategy 3: Bun's import.meta.resolve (ESM resolution)
  try {
    const resolved = import.meta.resolve(`sql.js-fts5/dist/${WASM_FILENAME}`);
    if (resolved) {
      const filePath = resolved.startsWith("file://")
        ? new URL(resolved).pathname
        : resolved;
      if (existsSync(filePath)) return filePath;
    }
  } catch {
    // Not resolvable
  }

  return null;
}

// Main
const wasmSource = findWasm();

if (!wasmSource) {
  console.error(
    `ERROR: Cannot find ${WASM_FILENAME}. Run 'bun install' to install sql.js-fts5.`
  );
  process.exit(1);
}

mkdirSync(TARGET_DIR, { recursive: true });
copyFileSync(wasmSource, TARGET_PATH);
console.log(`Copied ${WASM_FILENAME} → dist/mcp/`);
