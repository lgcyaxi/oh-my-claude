import { invoke } from '@tauri-apps/api/core';

/** Session info returned from Rust backend */
export interface SessionInfo {
	sessionId: string;
	port: number;
	controlPort: number;
	pid: number;
	startedAt: number;
	cwd: string | null;
	projectName: string;
	switched: boolean;
	provider: string | null;
	model: string | null;
	healthy: boolean;
}

/** Provider with its available models */
export interface ProviderInfo {
	name: string;
	models: ModelInfo[];
}

export interface ModelInfo {
	id: string;
	label: string;
}

/** Switch/revert response */
export interface SwitchResponse {
	switched: boolean;
	provider: string | null;
	model: string | null;
	sessionId: string | null;
	message: string | null;
	warning: string | null;
}

/** List all active proxy sessions */
export async function listSessions(): Promise<SessionInfo[]> {
	return invoke('list_sessions');
}

/** Switch a session to a different model */
export async function switchModel(
	controlPort: number,
	sessionId: string,
	provider: string,
	model: string,
): Promise<SwitchResponse> {
	return invoke('switch_model', {
		controlPort,
		sessionId,
		provider,
		model,
	});
}

/** Revert a session to native Claude */
export async function revertModel(
	controlPort: number,
	sessionId: string,
): Promise<SwitchResponse> {
	return invoke('revert_model', { controlPort, sessionId });
}

/** Get available providers and models from static registry (fallback) */
export async function getProviders(): Promise<ProviderInfo[]> {
	return invoke('get_providers');
}

/**
 * Get configured (available) providers from the proxy control API.
 * Only returns providers with valid API keys / credentials.
 * Falls back to static registry if proxy is unreachable.
 * Auto-discovers Ollama models for providers with empty model lists.
 */
export async function getAvailableProviders(
	controlPort: number,
): Promise<ProviderInfo[]> {
	let providers: ProviderInfo[];
	try {
		const resp = await fetch(`http://localhost:${controlPort}/providers`, {
			signal: AbortSignal.timeout(3000),
		});
		if (resp.ok) {
			const data = (await resp.json()) as { providers: ProviderInfo[] };
			providers = data.providers;
		} else {
			providers = await getProviders();
		}
	} catch {
		// Proxy unreachable — fall back to static registry
		providers = await getProviders();
	}

	// Auto-discover Ollama models for providers with empty model lists
	return enrichOllamaModels(providers);
}

// ---- Memory Model Configuration ----

export interface MemoryModelConfig {
	provider: string | null;
	model: string | null;
	source: 'runtime' | 'config' | 'auto';
}

/** Get current memory model configuration from proxy (via Tauri IPC) */
export async function getMemoryModelConfig(
	controlPort: number,
): Promise<MemoryModelConfig> {
	return invoke('get_memory_config', { controlPort });
}

/** Set memory model override at runtime (via Tauri IPC) */
export async function setMemoryModel(
	controlPort: number,
	provider: string,
	model: string,
): Promise<MemoryModelConfig> {
	return invoke('set_memory_config', { controlPort, provider, model });
}

/** Reset memory model to auto (use config file default or passthrough, via Tauri IPC) */
export async function resetMemoryModel(
	controlPort: number,
): Promise<MemoryModelConfig> {
	return invoke('reset_memory_config', { controlPort });
}

/**
 * If Ollama provider has empty models, auto-discover via Tauri command.
 * Uses Rust-side reqwest (bypasses WebView fetch restrictions).
 */
async function enrichOllamaModels(
	providers: ProviderInfo[],
): Promise<ProviderInfo[]> {
	const ollamaIdx = providers.findIndex((p) => p.name === 'ollama');
	if (ollamaIdx === -1 || providers[ollamaIdx].models.length > 0) {
		return providers;
	}

	try {
		const models: ModelInfo[] = await invoke('discover_ollama_models');
		if (models.length > 0) {
			providers[ollamaIdx] = { ...providers[ollamaIdx], models };
		}
	} catch {
		// Ollama unreachable — keep empty models
	}

	return providers;
}
