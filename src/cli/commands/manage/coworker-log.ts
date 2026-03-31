import {
	existsSync,
	readFileSync,
	unwatchFile,
	watchFile,
	writeFileSync,
} from 'node:fs';
import type { Command } from 'commander';
import { createFormatters } from '../../utils/colors';
import {
	getCoworkerLogPath,
	getCoworkerStatusPath,
	type CoworkerActivityEntry,
} from '../../../coworker/observability';

const STALENESS_THRESHOLD_MS = 90_000;
const IDLE_EXIT_THRESHOLD_MS = 25_000;
const PRINT_LINES = 50;
const PRINT_TRUNCATE = 500;
const LIVE_FLUSH_MS = 450;

const ANSI = {
	reset: '\x1b[0m',
	dim: '\x1b[2m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	bold: '\x1b[1m',
	blue: '\x1b[34m',
};

function relativeTime(isoTs: string): string {
	const diffMs = Date.now() - new Date(isoTs).getTime();
	const diffS = Math.floor(diffMs / 1000);
	if (diffS < 5) return 'just now';
	if (diffS < 60) return `${diffS}s ago`;
	const diffM = Math.floor(diffS / 60);
	if (diffM < 60) return `${diffM}m ago`;
	const diffH = Math.floor(diffM / 60);
	if (diffH < 24) return `${diffH}h ago`;
	return new Date(isoTs).toLocaleDateString();
}

function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return text.slice(0, maxLen) + ANSI.dim + '…' + ANSI.reset;
}

function parseEntries(raw: string): CoworkerActivityEntry[] {
	return raw
		.split('\n')
		.filter((line) => line.trim())
		.map((line) => {
			try {
				return JSON.parse(line) as CoworkerActivityEntry;
			} catch {
				return null;
			}
		})
		.filter((entry): entry is CoworkerActivityEntry => entry !== null);
}

function contentForMerge(type: CoworkerActivityEntry['type']): boolean {
	return type === 'text_delta' || type === 'plan_update';
}

/** Extract the descriptive prefix of a tool_activity entry (before \n). */
function toolActivityPrefix(content: string): string {
	const idx = content.indexOf('\n');
	return idx >= 0 ? content.slice(0, idx) : content;
}

function canMerge(
	left: CoworkerActivityEntry,
	right: CoworkerActivityEntry,
): boolean {
	if (left.type !== right.type) return false;
	if (left.sessionId !== right.sessionId || left.taskId !== right.taskId) {
		return false;
	}
	if (left.model !== right.model) return false;

	if (contentForMerge(left.type)) {
		return true;
	}

	if (left.type === 'tool_activity') {
		// Merge entries with same prefix (e.g. "command output" lines
		// that differ only in the raw delta after the newline).
		return (
			toolActivityPrefix(left.content) ===
			toolActivityPrefix(right.content)
		);
	}

	return false;
}

function mergeEntries(
	left: CoworkerActivityEntry,
	right: CoworkerActivityEntry,
): CoworkerActivityEntry {
	if (contentForMerge(left.type)) {
		return {
			...right,
			ts: right.ts,
			content: `${left.content}${right.content}`,
			meta: {
				...(left.meta ?? {}),
				...(right.meta ?? {}),
			},
		};
	}

	if (left.type === 'tool_activity') {
		const count = Number((left.meta as { count?: number } | undefined)?.count ?? 1) + 1;
		// Use only the prefix (before \n) so raw output lines are collapsed.
		const prefix = toolActivityPrefix(left.content);
		return {
			...right,
			ts: right.ts,
			content: prefix,
			meta: {
				...(left.meta ?? {}),
				...(right.meta ?? {}),
				count,
			},
		};
	}

	return right;
}

function aggregateEntries(
	entries: CoworkerActivityEntry[],
): CoworkerActivityEntry[] {
	const aggregated: CoworkerActivityEntry[] = [];
	for (const entry of entries) {
		const previous = aggregated.at(-1);
		if (previous && canMerge(previous, entry)) {
			aggregated[aggregated.length - 1] = mergeEntries(previous, entry);
			continue;
		}
		aggregated.push(entry);
	}
	return aggregated;
}

function formatEntry(
	target: string,
	entry: CoworkerActivityEntry,
	truncateContent = false,
): string {
	const rel = relativeTime(entry.ts);
	const dim = `${ANSI.dim}[${rel}]${ANSI.reset}`;
	const content = truncateContent
		? truncate(entry.content, PRINT_TRUNCATE)
		: entry.content;
	const label = target.toUpperCase();

	switch (entry.type) {
		case 'session_started':
			return (
				`\n${ANSI.dim}${'─'.repeat(40)}${ANSI.reset}\n` +
				`${ANSI.bold}${ANSI.blue}● New ${label} Session${ANSI.reset}` +
				(entry.model
					? ` ${ANSI.dim}(${entry.model})${ANSI.reset}`
					: '') +
				`  ${ANSI.dim}${new Date(entry.ts).toLocaleString()}${ANSI.reset}\n` +
				`${ANSI.dim}  ${content}${ANSI.reset}`
			);
		case 'task_started':
			return `${dim} ${ANSI.cyan}${ANSI.bold}TASK:${ANSI.reset}  ${content}`;
		case 'text_delta':
			return `${dim} ${ANSI.white}${label}:${ANSI.reset} ${content}`;
		case 'plan_update':
			return `${dim} ${ANSI.blue}PLAN:${ANSI.reset}  ${content}`;
		case 'tool_activity': {
			const count = Number(
				(entry.meta as { count?: number } | undefined)?.count ?? 1,
			);
			const suffix = count > 1 ? ` ${ANSI.dim}×${count}${ANSI.reset}` : '';
			// Show only the descriptive prefix, not raw output after \n
			const display = toolActivityPrefix(content);
			return `${dim} ${ANSI.yellow}TOOL:${ANSI.reset}  ${display}${suffix}`;
		}
		case 'task_completed':
			return `${dim} ${ANSI.green}✓ DONE:${ANSI.reset} ${content}`;
		case 'task_failed':
			return `${dim} ${ANSI.red}✗ ERROR:${ANSI.reset} ${content}`;
		case 'provider_event':
			return `${dim} ${ANSI.dim}EVENT:${ANSI.reset} ${content}`;
		default:
			return `${dim} ${(entry as CoworkerActivityEntry).type}: ${content}`;
	}
}

function renderEntries(
	target: string,
	entries: CoworkerActivityEntry[],
	options: { truncateContent?: boolean; raw?: boolean },
): string[] {
	const source = options.raw ? entries : aggregateEntries(entries);
	return source.map((entry) =>
		formatEntry(target, entry, options.truncateContent ?? false),
	);
}

class LiveRenderer {
	private pending: CoworkerActivityEntry | null = null;
	private flushTimer: NodeJS.Timeout | null = null;

	constructor(
		private readonly target: string,
		private readonly raw: boolean,
	) {}

	push(entries: CoworkerActivityEntry[]): void {
		const source = this.raw ? entries : aggregateEntries(entries);
		for (const entry of source) {
			if (this.raw) {
				console.log(formatEntry(this.target, entry, false));
				continue;
			}

			if (this.pending && canMerge(this.pending, entry)) {
				this.pending = mergeEntries(this.pending, entry);
				this.scheduleFlush();
				continue;
			}

			this.flush();
			this.pending = entry;
			this.scheduleFlush();
		}
	}

	flush(): void {
		if (!this.pending) return;
		console.log(formatEntry(this.target, this.pending, false));
		this.pending = null;
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
	}

	stop(): void {
		this.flush();
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
	}

	private scheduleFlush(): void {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
		}
		this.flushTimer = setTimeout(() => this.flush(), LIVE_FLUSH_MS);
	}
}

export function registerCoworkerLogSubcommand(
	parent: Command,
	target: 'opencode',
	label: string,
): Command {
	const logPath = getCoworkerLogPath(target);
	const statusPath = getCoworkerStatusPath(target);

	const sub = parent
		.command(target)
		.description(`Manage ${label} coworker and view activity`);
	sub.command('log')
		.description(`View ${label} coworker activity log`)
		.option('--print', 'print last 50 entries and exit')
		.option('--clear', 'truncate the log file')
		.option('--raw', 'show raw event stream without aggregation')
		.action((opts: { print?: boolean; clear?: boolean; raw?: boolean }) => {
			const { c } = createFormatters();
			if (opts.clear) {
				try {
					writeFileSync(logPath, '', 'utf-8');
					console.log(
						`${c.green}✓${c.reset} ${label} activity log cleared.`,
					);
				} catch (err) {
					console.error(
						`${c.red}✗${c.reset} Failed to clear log: ${err}`,
					);
					process.exit(1);
				}
				return;
			}

			if (opts.print) {
				if (!existsSync(logPath)) {
					console.log(
						`${c.dim}No ${label} activity log found.${c.reset}`,
					);
					return;
				}
				const entries = parseEntries(
					readFileSync(logPath, 'utf-8'),
				).slice(-PRINT_LINES);
				if (entries.length === 0) {
					console.log(`${c.dim}Activity log is empty.${c.reset}`);
					return;
				}
				console.log(
					`${ANSI.bold}${label} Coworker Log${ANSI.reset} ${ANSI.dim}(last ${entries.length} entries${opts.raw ? ', raw' : ', aggregated'})${ANSI.reset}`,
				);
				for (const line of renderEntries(target, entries, {
					truncateContent: true,
					raw: opts.raw,
				})) {
					console.log(line);
				}
				return;
			}

			if (!existsSync(logPath)) {
				console.log(
					`${c.dim}Waiting for ${label} activity log to be created...${c.reset}`,
				);
			} else {
				const entries = parseEntries(
					readFileSync(logPath, 'utf-8'),
				).slice(-20);
				if (entries.length > 0) {
					console.log(
						`${ANSI.dim}─── recent history (${opts.raw ? 'raw' : 'aggregated'}) ───${ANSI.reset}`,
					);
					for (const line of renderEntries(target, entries, {
						raw: opts.raw,
					})) {
						console.log(line);
					}
				}
			}

			console.log(
				`\n${ANSI.dim}─── live (${opts.raw ? 'raw' : 'aggregated'}, Ctrl+C to stop) ───${ANSI.reset}\n`,
			);

			const renderer = new LiveRenderer(target, opts.raw ?? false);
			let lastSize = existsSync(logPath)
				? readFileSync(logPath, 'utf-8').length
				: 0;

			// Grace period: don't auto-exit for the first 10s after launch.
			// This prevents instant exit when a stale status file exists
			// from a previous (already-completed) session.
			const viewerStartedAt = Date.now();
			const VIEWER_GRACE_MS = 10_000;

			const shouldExitFromStatus = (): boolean => {
				if (Date.now() - viewerStartedAt < VIEWER_GRACE_MS) {
					return false;
				}
				if (!existsSync(statusPath)) {
					return false;
				}
				try {
					const statusJson = JSON.parse(
						readFileSync(statusPath, 'utf-8'),
					) as { updatedAt?: number; state?: string };
					if (!statusJson.updatedAt) {
						return false;
					}
					const ageMs = Date.now() - statusJson.updatedAt;
					if (ageMs > STALENESS_THRESHOLD_MS) {
						return true;
					}
					if (
						['idle', 'complete', 'error'].includes(
							statusJson.state ?? '',
						) &&
						ageMs > IDLE_EXIT_THRESHOLD_MS
					) {
						return true;
					}
				} catch {}
				return false;
			};

			let exiting = false;
			const cleanExit = (message: string) => {
				if (exiting) return;
				exiting = true;
				try { renderer.stop(); } catch {}
				try { unwatchFile(logPath); } catch {}
				try { clearInterval(statusPoll); } catch {}
				// Remove SIGINT listener to release its event-loop ref.
				process.removeAllListeners('SIGINT');
				console.log(message);
				// Let event loop drain naturally instead of process.exit().
				// With all watchers/timers/listeners removed, the process
				// exits with code 0 without Bun teardown side-effects.
				process.exitCode = 0;
			};

			const maybeExit = () => {
				if (!shouldExitFromStatus()) {
					return;
				}
				cleanExit(
					`\n${ANSI.dim}${label} coworker stopped. Exiting viewer.${ANSI.reset}`,
				);
			};

			watchFile(logPath, { interval: 300 }, () => {
				maybeExit();

				try {
					const content = readFileSync(logPath, 'utf-8');
					if (content.length <= lastSize) {
						lastSize = content.length;
						return;
					}
					const newEntries = parseEntries(content.slice(lastSize));
					lastSize = content.length;
					renderer.push(newEntries);
				} catch {
					lastSize = 0;
				}
			});

			const statusPoll = setInterval(maybeExit, 1000);

			process.on('SIGINT', () => {
				cleanExit(`\n${ANSI.dim}Stopped.${ANSI.reset}`);
			});
		});

	return sub;
}
