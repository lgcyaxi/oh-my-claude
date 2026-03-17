import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolve path to the Bun executable.
 * The proxy server uses Bun.serve() and requires Bun runtime.
 */
export function resolveBunPath(): string {
	const isWin = process.platform === 'win32';
	const candidates: string[] = [];

	// Check common Bun install location on Unix
	if (!isWin) {
		const home = process.env.HOME;
		if (home) {
			candidates.push(join(home, '.bun', 'bin', 'bun'));
		}
	}

	if (isWin) {
		if (process.env.USERPROFILE) {
			candidates.push(join(process.env.USERPROFILE, '.bun', 'bin', 'bun.exe'));
		}

		try {
			const discovered = execSync('where bun', {
				encoding: 'utf-8',
				timeout: 3_000,
				stdio: ['ignore', 'pipe', 'ignore'],
				windowsHide: true,
			})
				.trim()
				.split(/\r?\n/)
				.map((entry) => entry.trim())
				.filter(Boolean)
				.filter((entry) => !/chocolatey/i.test(entry));
			candidates.push(...discovered);
		} catch {
			// Fall through to `which bun`.
		}
	}

	const preferred = candidates.find((candidate) => existsSync(candidate));
	if (preferred) {
		return preferred;
	}

	try {
		let bunPath = execSync('which bun', {
			encoding: 'utf-8',
			timeout: 3_000,
			stdio: ['ignore', 'pipe', 'ignore'],
			windowsHide: true,
		}).trim();
		if (bunPath) {
			if (isWin && /chocolatey/i.test(bunPath)) {
				bunPath = '';
			}
			if (isWin && /^\/[a-zA-Z]\//.test(bunPath)) {
				bunPath = bunPath[1]!.toUpperCase() + ':' + bunPath.slice(2);
			}
			return bunPath;
		}
	} catch {
		// Fall through to the user-facing error below.
	}

	throw new Error(
		'Bun runtime not found. The oh-my-claude proxy requires Bun.\n' +
			'Install Bun: curl -fsSL https://bun.sh/install | bash\n' +
			'Then restart your terminal and try again.',
	);
}
