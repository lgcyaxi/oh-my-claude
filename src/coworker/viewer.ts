import { execSync, spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

export interface ViewerHandle {
	attached: boolean;
	close(): void;
}

export interface SpawnViewerOptions {
	command: string;
	cwd?: string;
	noViewerEnv: string;
}

export const NOOP_VIEWER_HANDLE: ViewerHandle = {
	attached: false,
	close: () => {},
};

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function withCwd(command: string, cwd?: string): string {
	if (!cwd) return command;
	return `cd ${shellQuote(cwd)} && ${command}`;
}

function which(command: string): string | null {
	try {
		const result = spawnSync('which', [command], { encoding: 'utf-8' });
		if (result.status === 0 && result.stdout) {
			return result.stdout.trim();
		}
	} catch {}
	return null;
}

let cachedNativeBash: string | null | undefined; // undefined = not yet resolved

/**
 * Find the native Git Bash (MSYS2) on Windows for proper shell wrapping.
 * On non-Windows, returns 'bash'. Returns null if not found.
 */
export function resolveNativeBash(): string | null {
	if (cachedNativeBash !== undefined) return cachedNativeBash;
	if (process.platform !== 'win32') {
		cachedNativeBash = 'bash';
		return cachedNativeBash;
	}
	const candidates = [
		'C:/Program Files/Git/bin/bash.exe',
		'C:/Program Files (x86)/Git/bin/bash.exe',
		`${process.env.LOCALAPPDATA ?? ''}/Programs/Git/bin/bash.exe`,
		`${process.env.ProgramFiles ?? ''}/Git/bin/bash.exe`,
		'D:/Program Files/Git/bin/bash.exe',
		'D:/Git/bin/bash.exe',
	];
	for (const p of candidates) {
		if (p && existsSync(p)) {
			cachedNativeBash = p;
			return p;
		}
	}
	// Fallback: derive from `where git` / `which git`
	// Git can live at .../Git/cmd/git.exe, .../Git/mingw64/bin/git.exe, etc.
	// Walk up from the git binary to find the Git root containing bin/bash.exe.
	const gitPath = which('git');
	if (gitPath) {
		const parts = gitPath.replace(/\\/g, '/').split('/');
		// Try progressively shorter prefixes (skip filename itself)
		for (let i = parts.length - 2; i >= 1; i--) {
			const bash = parts.slice(0, i + 1).join('/') + '/bin/bash.exe';
			if (existsSync(bash)) {
				cachedNativeBash = bash;
				return bash;
			}
		}
	}
	cachedNativeBash = null;
	return null;
}

/** Reset cached bash path — for testing only. */
export function _resetNativeBashCache(): void {
	cachedNativeBash = undefined;
}

function spawnTmux(command: string, cwd?: string): ViewerHandle {
	try {
		const shellCommand = withCwd(command, cwd);
		const paneId = execSync(
			[
				'tmux split-window -h -P -F',
				shellQuote('#{pane_id}'),
				cwd ? `-c ${shellQuote(cwd)}` : '',
				'bash -lc',
				shellQuote(shellCommand),
			]
				.filter(Boolean)
				.join(' '),
			{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
		).trim();

		return {
			attached: paneId.length > 0,
			close() {
				try {
					execSync(`tmux kill-pane -t ${paneId}`, { stdio: 'pipe' });
				} catch {}
			},
		};
	} catch {
		return NOOP_VIEWER_HANDLE;
	}
}

function spawnMacOSTerminal(command: string, cwd?: string): ViewerHandle {
	try {
		const shellCommand = `${withCwd(command, cwd)}; exit`;
		const script = `tell application "Terminal" to do script "${shellCommand.replace(/"/g, '\\"')}"`;
		execSync(`osascript -e ${shellQuote(script)}`, { stdio: 'pipe' });
		return {
			attached: true,
			close() {},
		};
	} catch {
		return NOOP_VIEWER_HANDLE;
	}
}

function spawnXterm(command: string, cwd?: string): ViewerHandle {
	let proc: ChildProcess | null = null;
	try {
		proc = spawn('xterm', ['-e', 'bash', '-lc', withCwd(command, cwd)], {
			detached: true,
			stdio: 'ignore',
		});
		proc.unref();
		const captured = proc;
		return {
			attached: true,
			close() {
				try {
					captured.kill();
				} catch {}
			},
		};
	} catch {
		return NOOP_VIEWER_HANDLE;
	}
}

function isShellBoundaryChar(char: string | undefined): boolean {
	return (
		char === undefined ||
		/\s/.test(char) ||
		char === '&' ||
		char === '|' ||
		char === ';' ||
		char === '(' ||
		char === ')'
	);
}

function resolveViewerCommand(command: string): string {
	const omc = which('oh-my-claude') ?? which('omc');
	if (!omc) {
		return command;
	}

	const tokens = ['oh-my-claude', 'omc'] as const;
	let output = '';
	let i = 0;
	let quote: "'" | '"' | null = null;

	while (i < command.length) {
		const current = command[i];
		if (quote) {
			output += current;
			if (current === quote) {
				quote = null;
			} else if (
				quote === '"' &&
				current === '\\' &&
				i + 1 < command.length
			) {
				i += 1;
				output += command[i];
			}
			i += 1;
			continue;
		}

		if (current === "'" || current === '"') {
			quote = current;
			output += current;
			i += 1;
			continue;
		}

		let replaced = false;
		for (const token of tokens) {
			if (!command.startsWith(token, i)) {
				continue;
			}
			const prev = i === 0 ? undefined : command[i - 1];
			const next = command[i + token.length];
			if (!isShellBoundaryChar(prev) || !isShellBoundaryChar(next)) {
				continue;
			}
			output += omc;
			i += token.length;
			replaced = true;
			break;
		}

		if (replaced) {
			continue;
		}

		output += current;
		i += 1;
	}

	return output;
}

export function spawnCoworkerViewer(options: SpawnViewerOptions): ViewerHandle {
	if (process.env[options.noViewerEnv] === '1') {
		return NOOP_VIEWER_HANDLE;
	}

	// For bash-based viewers (tmux, xterm), use the bare command
	// since the binary is in bash's PATH. resolveViewerCommand returns
	// Windows-style paths (C:\...) from `where` which work but add no value.
	// For macOS Terminal (AppleScript), resolve the full path for reliability.
	if (process.env.TMUX) {
		return spawnTmux(options.command, options.cwd);
	}

	const command = resolveViewerCommand(options.command);

	if (process.platform === 'darwin') {
		return spawnMacOSTerminal(command, options.cwd);
	}

	if (process.platform === 'linux' && process.env.DISPLAY) {
		return spawnXterm(options.command, options.cwd);
	}

	return NOOP_VIEWER_HANDLE;
}
