import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

export function startCodexProcess(args: {
	command: string;
	commandArgs: string[];
	projectPath: string;
}): ChildProcess {
	return spawn(args.command, args.commandArgs, {
		stdio: ['pipe', 'pipe', 'pipe'],
		cwd: args.projectPath,
		windowsHide: true,
		shell: process.platform === 'win32',
	});
}

export async function stopCodexProcess(proc: ChildProcess): Promise<void> {
	try {
		proc.stdin?.end();
	} catch {}

	await new Promise<void>((resolve) => {
		const timer = setTimeout(() => {
			proc.kill('SIGKILL');
			resolve();
		}, 5_000);
		proc.once('close', () => {
			clearTimeout(timer);
			resolve();
		});
	});
}

export function verifyCodexInstallation(command: string): Promise<void> {
	return runCommand(command, ['--version'], 8_000);
}

export function runCommand(
	command: string,
	args: string[],
	timeoutMs: number,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ['ignore', 'ignore', 'pipe'],
			shell: process.platform === 'win32',
			windowsHide: true,
		});

		let stderr = '';
		const timer = setTimeout(() => {
			child.kill();
			reject(
				new Error(`Command timed out after ${timeoutMs}ms: ${command}`),
			);
		}, timeoutMs);

		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderr += chunk.toString();
		});
		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`Command failed (${code ?? 'unknown'}): ${command} ${args.join(' ')} ${stderr}`.trim(),
					),
				);
			}
		});
	});
}
