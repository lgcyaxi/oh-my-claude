import type { AIDaemonBaseContext } from './types';

const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

export async function ensureRunning(ctx: AIDaemonBaseContext): Promise<void> {
	if (ctx.status === 'running') {
		return;
	}

	if (ctx.startPromise) {
		await ctx.startPromise;
		return;
	}

	ctx.startPromise = (async () => {
		ctx.setStatus('starting');
		try {
			await ctx.start();
			ctx.setStatus('running');
		} catch (error) {
			ctx.setStatus('error');
			throw error;
		}
	})();

	try {
		await ctx.startPromise;
	} finally {
		ctx.startPromise = null;
	}
}

export function clearIdleTimer(
	ctx: Pick<AIDaemonBaseContext, 'idleTimer'>,
): void {
	if (!ctx.idleTimer) {
		return;
	}

	clearTimeout(ctx.idleTimer);
	ctx.idleTimer = null;
}

export function resetIdleTimer(
	ctx: Pick<
		AIDaemonBaseContext,
		| 'config'
		| 'idleTimer'
		| 'activeRequest'
		| 'requestQueue'
		| 'status'
		| 'setStatus'
		| 'stop'
		| 'stopPromise'
	>,
): void {
	clearIdleTimer(ctx);

	const idleTimeoutMs =
		ctx.config.idleTimeoutMs > 0
			? ctx.config.idleTimeoutMs
			: DEFAULT_IDLE_TIMEOUT_MS;

	ctx.idleTimer = setTimeout(() => {
		void stopIfIdle(ctx);
	}, idleTimeoutMs);
}

export async function stopIfIdle(
	ctx: Pick<
		AIDaemonBaseContext,
		| 'activeRequest'
		| 'requestQueue'
		| 'status'
		| 'setStatus'
		| 'stop'
		| 'stopPromise'
	>,
): Promise<void> {
	if (ctx.activeRequest || ctx.requestQueue.length > 0) {
		return;
	}

	if (ctx.status !== 'running') {
		return;
	}

	if (ctx.stopPromise) {
		await ctx.stopPromise;
		return;
	}

	ctx.stopPromise = (async () => {
		ctx.setStatus('stopping');
		try {
			await ctx.stop();
			ctx.setStatus('stopped');
		} catch {
			ctx.setStatus('error');
		}
	})();

	try {
		await ctx.stopPromise;
	} finally {
		ctx.stopPromise = null;
	}
}
