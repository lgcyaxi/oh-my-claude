import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

export interface OpenCodeGlobalEvent {
	directory?: string;
	payload?: {
		type?: string;
		properties?: Record<string, unknown>;
	};
}

export interface OpenCodeToastOptions {
	title?: string;
	message: string;
	variant?: 'info' | 'success' | 'warning' | 'error';
	duration?: number;
}

async function getFreePort(): Promise<number> {
	return await new Promise<number>((resolve, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close(() =>
					reject(new Error('Failed to allocate a free port')),
				);
				return;
			}
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(address.port);
			});
		});
	});
}

async function delay(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenCodeServerProcess {
	private proc: ChildProcess | null = null;
	private port: number | null = null;
	private readonly hostname = '127.0.0.1';
	private readonly listeners = new Set<
		(event: OpenCodeGlobalEvent) => void
	>();
	private eventAbortController: AbortController | null = null;
	private eventLoopPromise: Promise<void> | null = null;

	constructor(private readonly projectPath: string) {}

	get baseUrl(): string {
		if (this.port === null) {
			throw new Error('OpenCode server is not running');
		}
		return `http://${this.hostname}:${this.port}`;
	}

	get status(): 'running' | 'stopped' | 'error' {
		if (this.proc === null) {
			return 'stopped';
		}
		return this.proc.exitCode === null ? 'running' : 'error';
	}

	subscribe(listener: (event: OpenCodeGlobalEvent) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	async selectTuiSession(sessionId: string): Promise<boolean> {
		return this.postJson('/tui/select-session', { sessionID: sessionId });
	}

	async showTuiToast(options: OpenCodeToastOptions): Promise<boolean> {
		return this.postJson('/tui/show-toast', {
			title: options.title,
			message: options.message,
			variant: options.variant ?? 'info',
			duration: options.duration,
		});
	}

	async appendTuiPrompt(text: string): Promise<boolean> {
		return this.postJson('/tui/append-prompt', { text });
	}

	async submitTuiPrompt(): Promise<boolean> {
		return this.postJson('/tui/submit-prompt', {});
	}

	async clearTuiPrompt(): Promise<boolean> {
		return this.postJson('/tui/clear-prompt', {});
	}

	async executeTuiCommand(command: string): Promise<boolean> {
		return this.postJson('/tui/execute-command', { command });
	}

	async start(): Promise<void> {
		if (this.proc && this.proc.exitCode === null) {
			await this.waitForHealthy();
			this.ensureEventStream();
			return;
		}

		await this.verifyInstallation();
		this.port = await getFreePort();

		this.proc = spawn(
			'opencode',
			['serve', '--hostname', this.hostname, '--port', String(this.port)],
			{
				cwd: this.projectPath,
				stdio: ['ignore', 'pipe', 'pipe'],
				windowsHide: true,
				shell: process.platform === 'win32',
			},
		);

		this.proc.stdout?.on('data', (chunk: Buffer) => {
			process.stderr.write(`[opencode-server] ${chunk.toString('utf8')}`);
		});
		this.proc.stderr?.on('data', (chunk: Buffer) => {
			process.stderr.write(`[opencode-server] ${chunk.toString('utf8')}`);
		});

		this.proc.once('error', (error) => {
			process.stderr.write(
				`[opencode-server] failed: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		});

		await this.waitForHealthy();
		this.ensureEventStream();
	}

	async stop(): Promise<void> {
		this.eventAbortController?.abort();
		this.eventAbortController = null;
		this.eventLoopPromise = null;

		const proc = this.proc;
		this.proc = null;
		if (!proc) {
			this.port = null;
			return;
		}

		try {
			await fetch(`${this.baseUrl}/global/dispose`, { method: 'POST' });
		} catch {
			// Best-effort; fall back to process termination.
		}

		if (proc.exitCode === null) {
			try {
				proc.kill('SIGTERM');
			} catch {}
		}

		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				try {
					if (proc.exitCode === null) {
						proc.kill('SIGKILL');
					}
				} catch {}
				resolve();
			}, 5_000);
			proc.once('close', () => {
				clearTimeout(timer);
				resolve();
			});
		});

		this.port = null;
	}

	private ensureEventStream(): void {
		if (this.eventLoopPromise || this.port === null) {
			return;
		}
		this.eventAbortController = new AbortController();
		this.eventLoopPromise = this.consumeGlobalEvents(
			this.eventAbortController.signal,
		).finally(() => {
			this.eventLoopPromise = null;
		});
	}

	private async consumeGlobalEvents(signal: AbortSignal): Promise<void> {
		const response = await fetch(`${this.baseUrl}/global/event`, {
			signal,
		});
		if (!response.ok || !response.body) {
			throw new Error(
				`OpenCode global event stream failed: ${response.status}`,
			);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (!signal.aborted) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let boundary = buffer.indexOf('\n\n');
			while (boundary >= 0) {
				const chunk = buffer.slice(0, boundary).trim();
				buffer = buffer.slice(boundary + 2);
				this.handleSseChunk(chunk);
				boundary = buffer.indexOf('\n\n');
			}
		}
	}

	private handleSseChunk(chunk: string): void {
		if (!chunk) return;
		for (const line of chunk.split('\n')) {
			if (!line.startsWith('data:')) continue;
			const payload = line.slice(5).trim();
			if (!payload) continue;
			try {
				const event = JSON.parse(payload) as OpenCodeGlobalEvent;
				for (const listener of this.listeners) {
					listener(event);
				}
			} catch {
				// Ignore malformed events.
			}
		}
	}

	private async verifyInstallation(): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const child = spawn('opencode', ['--version'], {
				stdio: ['ignore', 'ignore', 'pipe'],
				windowsHide: true,
				shell: process.platform === 'win32',
			});

			let stderr = '';
			child.stderr?.on('data', (chunk: Buffer) => {
				stderr += chunk.toString('utf8');
			});
			child.once('error', reject);
			child.once('close', (code) => {
				if (code === 0) {
					resolve();
					return;
				}
				reject(
					new Error(
						stderr.trim() ||
							'OpenCode CLI is not available. Install with: npm install -g opencode-ai',
					),
				);
			});
		});
	}

	private async waitForHealthy(): Promise<void> {
		if (this.port === null) {
			throw new Error('OpenCode server port is not initialized');
		}

		const deadline = Date.now() + 15_000;
		let lastError: Error | null = null;

		while (Date.now() < deadline) {
			if (this.proc && this.proc.exitCode !== null) {
				throw new Error(
					`OpenCode server exited with code ${this.proc.exitCode}`,
				);
			}
			try {
				const response = await fetch(`${this.baseUrl}/global/health`, {
					signal: AbortSignal.timeout(1_500),
				});
				if (response.ok) {
					return;
				}
				lastError = new Error(
					`Health check returned ${response.status}`,
				);
			} catch (error) {
				lastError =
					error instanceof Error ? error : new Error(String(error));
			}
			await delay(200);
		}

		throw (
			lastError ??
			new Error('Timed out waiting for OpenCode server health')
		);
	}

	private async postJson(
		path: string,
		body: Record<string, unknown>,
		timeoutMs = 3_000,
	): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}${path}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(timeoutMs),
			});
			return response.ok;
		} catch {
			return false;
		}
	}
}
