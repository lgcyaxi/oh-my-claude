export {
	shortHash,
	getStateFile,
	getSessionLogPath,
	findGitRoot,
	resolveCanonicalRoot,
	formatLocalYYYYMMDDLite,
	formatLocalHHMMSSLite,
} from './paths';

export {
	getControlPort,
	isProxyHealthy,
	ensureProxy,
	cleanupAutoProxy,
} from './proxy';

export { loadHookConfig } from './config';
export type { HookConfig, AutoRotateConfig } from './config';

export {
	loadState,
	saveState,
	getSessionLogSizeKB,
	readSessionLog,
	clearSessionLog,
	pruneEmptySessionLogs,
	logUserPrompt,
} from './session';
export type { ContextMemoryState } from './session';

export { getTimelineContent } from './timeline';
