/**
 * Shared file-lock + atomic-write + safe-load utilities.
 *
 * Extracted from the `withRegistryLock` pattern in
 * `src/proxy/state/instance-registry.ts` so every RMW call site across the
 * codebase shares identical semantics:
 *
 *   1. `openSync(lockPath, 'wx')` — atomic O_CREAT|O_EXCL acquire.
 *   2. Retry with small jitter; unlink stale locks after `staleMs`.
 *   3. Atomic writes via `writeFileSync(tmp)` → `renameSync(tmp, final)`.
 *   4. JSON loads validate via a Zod-like `{ parse }` schema and back up on
 *      parse/validate failure instead of silently falling back to `{}`.
 *
 * All public helpers are synchronous by default — they are called from hot
 * paths (CLI startup, proxy RMW cycles, memory indexer) where async
 * boundaries add overhead. An async variant is provided for callers that
 * legitimately need to run `await`-based work under the lock.
 */

import {
	openSync,
	closeSync,
	unlinkSync,
	existsSync,
	mkdirSync,
	writeFileSync,
	renameSync,
	readFileSync,
	statSync,
	chmodSync,
	copyFileSync,
} from "fs";
import { dirname } from "path";

// ---------------------------------------------------------------------------
// Lock primitives
// ---------------------------------------------------------------------------

export interface FileLockOptions {
	/** Number of times to retry acquiring the lock before giving up. */
	retries?: number;
	/** Base backoff in ms between retries (adds up to same amount of jitter). */
	backoffMs?: number;
	/** Stale lock TTL — if a lock file is older than this, it is unlinked and retried. */
	staleMs?: number;
}

const DEFAULT_RETRIES = 10;
const DEFAULT_BACKOFF_MS = 20;
const DEFAULT_STALE_MS = 5_000;

function sleepBlockingMs(ms: number): void {
	const end = Date.now() + ms;
	// Busy-wait — retries are sub-second and all call sites are sync.
	while (Date.now() < end) {
		// nothing
	}
}

function acquireLock(lockPath: string, opts: Required<FileLockOptions>): number | null {
	const dir = dirname(lockPath);
	for (let i = 0; i < opts.retries; i++) {
		try {
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			return openSync(lockPath, "wx");
		} catch (err) {
			const code = (err as NodeJS.ErrnoException | undefined)?.code;
			if (code !== "EEXIST") {
				// Permission / I/O issue — caller proceeds unlocked.
				return null;
			}
			try {
				const stat = statSync(lockPath);
				if (Date.now() - stat.mtimeMs > opts.staleMs) {
					try {
						unlinkSync(lockPath);
					} catch {
						/* race with another reaper — retry */
					}
					continue;
				}
			} catch {
				// statSync raced with another unlink; just retry.
			}
			sleepBlockingMs(opts.backoffMs + Math.random() * opts.backoffMs);
		}
	}
	return null;
}

function releaseLock(fd: number | null, lockPath: string): void {
	if (fd === null) return;
	try {
		closeSync(fd);
	} catch {
		/* ignore */
	}
	try {
		unlinkSync(lockPath);
	} catch {
		/* already gone */
	}
}

/**
 * Run a synchronous closure under an advisory file lock.
 *
 * If the lock cannot be acquired within `retries`, falls back to running the
 * closure unlocked (best-effort — matches the legacy `withRegistryLock`
 * behaviour: never fails outright just because lock contention is high).
 */
export function withFileLockSync<T>(
	lockPath: string,
	fn: () => T,
	opts: FileLockOptions = {},
): T {
	const resolved: Required<FileLockOptions> = {
		retries: opts.retries ?? DEFAULT_RETRIES,
		backoffMs: opts.backoffMs ?? DEFAULT_BACKOFF_MS,
		staleMs: opts.staleMs ?? DEFAULT_STALE_MS,
	};
	const fd = acquireLock(lockPath, resolved);
	try {
		return fn();
	} finally {
		releaseLock(fd, lockPath);
	}
}

/**
 * Run an async closure under an advisory file lock.
 *
 * Acquires and releases the lock synchronously (same O_EXCL semantics as the
 * sync variant) but awaits the inner function between.
 */
export async function withFileLock<T>(
	lockPath: string,
	fn: () => T | Promise<T>,
	opts: FileLockOptions = {},
): Promise<T> {
	const resolved: Required<FileLockOptions> = {
		retries: opts.retries ?? DEFAULT_RETRIES,
		backoffMs: opts.backoffMs ?? DEFAULT_BACKOFF_MS,
		staleMs: opts.staleMs ?? DEFAULT_STALE_MS,
	};
	const fd = acquireLock(lockPath, resolved);
	try {
		return await fn();
	} finally {
		releaseLock(fd, lockPath);
	}
}

// ---------------------------------------------------------------------------
// Atomic writes
// ---------------------------------------------------------------------------

export interface AtomicWriteOptions {
	/** POSIX file mode to apply after rename (no-op on Windows). */
	mode?: number;
}

function atomicTempPath(path: string): string {
	return `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureParentDir(path: string): void {
	const dir = dirname(path);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

function applyMode(path: string, mode: number | undefined): void {
	if (mode === undefined || process.platform === "win32") return;
	try {
		chmodSync(path, mode);
	} catch {
		// Best-effort — POSIX permission tightening.
	}
}

/**
 * Atomically write UTF-8 text to `path` via temp-file + rename.
 *
 * Safe for concurrent readers on POSIX (`rename(2)` is atomic) and Windows
 * (Node.js emulates atomic rename over ReplaceFile). Optionally applies the
 * provided POSIX mode after rename.
 */
export function atomicWriteText(
	path: string,
	text: string,
	opts: AtomicWriteOptions = {},
): void {
	ensureParentDir(path);
	const tmp = atomicTempPath(path);
	writeFileSync(tmp, text, "utf-8");
	applyMode(tmp, opts.mode);
	renameSync(tmp, path);
	applyMode(path, opts.mode);
}

export interface AtomicWriteJsonOptions extends AtomicWriteOptions {
	/** Indentation passed to JSON.stringify. Default: "\t" (tab). */
	indent?: string | number;
	/** Whether to append a trailing newline. Default: true. */
	trailingNewline?: boolean;
}

/**
 * Atomically write a JSON-serializable value to `path`.
 *
 * Defaults match the existing `writeInstances` convention (tab indentation,
 * trailing newline). Override `indent` / `trailingNewline` when writing to
 * files that follow a different convention (e.g. Claude Code's
 * 2-space-indented `settings.json` and `~/.claude.json`).
 */
export function atomicWriteJson(
	path: string,
	value: unknown,
	opts: AtomicWriteJsonOptions = {},
): void {
	const indent = opts.indent ?? "\t";
	const trailing = opts.trailingNewline ?? true;
	const text = JSON.stringify(value, null, indent) + (trailing ? "\n" : "");
	atomicWriteText(path, text, { mode: opts.mode });
}

// ---------------------------------------------------------------------------
// Safe JSON loading with backup-on-corrupt
// ---------------------------------------------------------------------------

/** Minimal schema interface satisfied by Zod, Valibot, or ad-hoc validators. */
export interface SchemaLike<T> {
	parse(input: unknown): T;
}

/**
 * Thrown by `loadJsonOrBackup` when the on-disk file exists but cannot be
 * parsed or fails schema validation. Callers should surface the error rather
 * than silently recreating the file — that is the whole point of the helper.
 */
export class JsonCorruptError extends Error {
	public override readonly name = "JsonCorruptError";
	constructor(
		message: string,
		public readonly path: string,
		public readonly backupPath: string,
		public override readonly cause?: unknown,
	) {
		super(message);
	}
}

export interface LoadJsonOptions {
	/**
	 * Invoked after a corrupt file has been copied to the backup path, before
	 * the error is thrown. Useful for emitting a stderr warning.
	 */
	onCorrupt?: (backupPath: string, err: unknown) => void;
}

function backupCorruptFile(path: string): string {
	const backupPath = `${path}.corrupt-${Date.now()}.bak`;
	try {
		copyFileSync(path, backupPath);
	} catch {
		// Backup failed — we still raise the error below so callers notice.
	}
	return backupPath;
}

/**
 * Load+validate a JSON file. Returns `null` when the file is missing.
 *
 * Corruption protocol (mirrors the `SettingsCorruptError` pattern from
 * beta.5): on parse or schema failure, the file is copied to
 * `<path>.corrupt-<unix>.bak` and a `JsonCorruptError` is thrown. Callers
 * decide whether to abort the operation or recreate defaults; never do both
 * silently.
 */
export function loadJsonOrBackup<T>(
	path: string,
	schema: SchemaLike<T>,
	opts: LoadJsonOptions = {},
): T | null {
	if (!existsSync(path)) return null;
	let raw: string;
	try {
		raw = readFileSync(path, "utf-8");
	} catch (err) {
		const backupPath = backupCorruptFile(path);
		opts.onCorrupt?.(backupPath, err);
		throw new JsonCorruptError(
			`Failed to read JSON file at ${path}: ${(err as Error).message}`,
			path,
			backupPath,
			err,
		);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const backupPath = backupCorruptFile(path);
		opts.onCorrupt?.(backupPath, err);
		throw new JsonCorruptError(
			`Failed to parse JSON at ${path}: ${(err as Error).message}`,
			path,
			backupPath,
			err,
		);
	}
	try {
		return schema.parse(parsed);
	} catch (err) {
		const backupPath = backupCorruptFile(path);
		opts.onCorrupt?.(backupPath, err);
		throw new JsonCorruptError(
			`Schema validation failed for ${path}: ${(err as Error).message}`,
			path,
			backupPath,
			err,
		);
	}
}
