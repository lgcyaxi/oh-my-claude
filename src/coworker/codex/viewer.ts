import { spawnCoworkerViewer, type ViewerHandle } from '../viewer';
export type { ViewerHandle } from '../viewer';

export function spawnCodexViewer(): ViewerHandle {
	return spawnCoworkerViewer({
		command: 'oh-my-claude m codex log',
		noViewerEnv: 'CODEX_NO_VIEWER',
	});
}
