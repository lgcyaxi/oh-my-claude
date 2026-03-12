import { spawnCoworkerViewer, type ViewerHandle } from '../viewer';

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export type { ViewerHandle } from '../viewer';

export function spawnOpenCodeViewer(
	baseUrl: string,
	projectPath: string,
	sessionId?: string | null,
): ViewerHandle {
	const sessionArgs = sessionId
		? `--continue --session ${shellQuote(sessionId)}`
		: '--continue';

	return spawnCoworkerViewer({
		command: `opencode attach ${shellQuote(baseUrl)} ${sessionArgs} || opencode`,
		cwd: projectPath,
		noViewerEnv: 'OPENCODE_NO_VIEWER',
	});
}
