export {
	shortHash,
	getStateFile,
	getSessionLogPath,
	findGitRoot,
	resolveCanonicalRoot,
} from './paths';

export {
	getControlPort,
	isProxyHealthy,
	ensureProxy,
	cleanupAutoProxy,
} from './proxy';

export { loadHookConfig } from './config';
export type { HookConfig } from './config';

export {
	loadState,
	saveState,
	getSessionLogSizeKB,
	readSessionLog,
	clearSessionLog,
	logUserPrompt,
} from './session';
export type { ContextMemoryState } from './session';

export { getTimelineContent } from './timeline';
