import type { CoworkerTaskRequest } from '../types';
import type { OpenCodeServerProcess } from './server';
import type {
	OpenCodeAgentEntry,
	OpenCodeProviderResponse,
	OpenCodeSessionResponse,
} from './types';

export interface OpenCodeExecutionConfig {
	requestedAgent: string | null;
	agent: string;
	agentNative: boolean | null;
	providerId: string | null;
	modelId: string | null;
	modelLabel: string | null;
	meta: Record<string, unknown>;
}

export interface OpenCodeRuntimeSnapshot {
	requestedAgent: string | null;
	agentName: string | null;
	agentNative: boolean | null;
	providerId: string | null;
	modelId: string | null;
}

export function currentOpenCodeModelLabel(
	providerId: string | null,
	modelId: string | null,
): string | null {
	return providerId && modelId ? `${providerId}/${modelId}` : null;
}

export function buildOpenCodeRuntimeMeta(
	state: OpenCodeRuntimeSnapshot,
): Record<string, unknown> {
	return {
		requestedAgent: state.requestedAgent,
		agent: state.agentName,
		agentNative: state.agentNative,
		provider: state.providerId,
		model: state.modelId,
		approvalPolicy: 'external',
	};
}

function normalizeAgentKey(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveOpenCodeAgentEntry(args: {
	agents: OpenCodeAgentEntry[];
	preferredName: string;
}): OpenCodeAgentEntry {
	const preferredName = args.preferredName.trim();
	const lowerName = preferredName.toLowerCase();
	const normalized = normalizeAgentKey(preferredName);

	const exact = args.agents.find((entry) => entry.name === preferredName);
	if (exact) {
		return exact;
	}

	const caseInsensitive = args.agents.find(
		(entry) => entry.name.toLowerCase() === lowerName,
	);
	if (caseInsensitive) {
		return caseInsensitive;
	}

	const fuzzyMatches = args.agents.filter((entry) => {
		const entryLower = entry.name.toLowerCase();
		const entryNormalized = normalizeAgentKey(entry.name);
		if (entryNormalized === normalized || entryNormalized.startsWith(normalized)) {
			return true;
		}
		const tokens = entryLower.split(/[^a-z0-9]+/).filter(Boolean);
		return tokens.some(
			(token) => token === lowerName || token.startsWith(lowerName),
		);
	});

	if (fuzzyMatches.length === 1) {
		return fuzzyMatches[0]!;
	}

	if (fuzzyMatches.length > 1) {
		throw new Error(
			`OpenCode agent is ambiguous: ${preferredName}. Candidates: ${fuzzyMatches
				.map((entry) => entry.name)
				.join(', ')}`,
		);
	}

	throw new Error(`OpenCode agent not found: ${preferredName}`);
}

export async function ensureOpenCodeSession(
	server: OpenCodeServerProcess,
	projectPath: string,
	currentSessionId: string | null,
): Promise<string> {
	if (currentSessionId) {
		return currentSessionId;
	}

	const response = await fetch(`${server.baseUrl}/session`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			title: `oh-my-claude coworker (${projectPath})`,
		}),
		signal: AbortSignal.timeout(10_000),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(
			`Failed to create OpenCode session: ${response.status} ${body}`.trim(),
		);
	}

	const session = (await response.json()) as OpenCodeSessionResponse;
	if (!session.id) {
		throw new Error('OpenCode session response did not include an id');
	}

	return session.id;
}

export async function listOpenCodeAgents(
	server: OpenCodeServerProcess,
): Promise<OpenCodeAgentEntry[]> {
	const response = await fetch(`${server.baseUrl}/agent`, {
		signal: AbortSignal.timeout(5_000),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(
			`Failed to list OpenCode agents: ${response.status} ${body}`.trim(),
		);
	}

	return (await response.json()) as OpenCodeAgentEntry[];
}

export async function ensureOpenCodeProvider(
	server: OpenCodeServerProcess,
	providerId: string,
): Promise<void> {
	const response = await fetch(`${server.baseUrl}/provider`, {
		signal: AbortSignal.timeout(5_000),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(
			`Failed to list OpenCode providers: ${response.status} ${body}`.trim(),
		);
	}

	const providers = (await response.json()) as OpenCodeProviderResponse;
	const found = (providers.all ?? []).some(
		(entry) => entry.id === providerId || entry.name === providerId,
	);
	if (!found) {
		throw new Error(`OpenCode provider not found: ${providerId}`);
	}
}

async function ensureOpenCodeAgent(
	server: OpenCodeServerProcess,
	agents: OpenCodeAgentEntry[],
): Promise<OpenCodeAgentEntry> {
	const preferredAgent = process.env.OMC_OPENCODE_AGENT;
	const preferred =
		(preferredAgent
			? resolveOpenCodeAgentEntry({ agents, preferredName: preferredAgent })
			: null) ??
		agents.find((agent) => agent.native && agent.name === 'build') ??
		agents.find((agent) => agent.native && agent.name === 'general') ??
		agents.find((agent) => agent.native && agent.name === 'explore') ??
		agents.find(
			(agent) =>
				agent.native &&
				agent.mode === 'subagent' &&
				!['compaction', 'title', 'summary'].includes(agent.name),
		) ??
		agents.find(
			(agent) =>
				agent.native &&
				agent.mode === 'primary' &&
				!['compaction', 'title', 'summary'].includes(agent.name),
		);

	if (!preferred?.name) {
		throw new Error(
			'OpenCode did not expose a primary agent for coworker execution',
		);
	}

	return preferred;
}

export async function resolveOpenCodeExecutionConfig(args: {
	server: OpenCodeServerProcess;
	request: CoworkerTaskRequest;
	state: OpenCodeRuntimeSnapshot;
}): Promise<OpenCodeExecutionConfig> {
	const agents = await listOpenCodeAgents(args.server);
	const preferredName =
		args.request.agent ?? process.env.OMC_OPENCODE_AGENT ?? null;
	const resolvedAgentEntry = (() => {
		if (preferredName) {
			return resolveOpenCodeAgentEntry({ agents, preferredName });
		}

		if (
			args.state.agentName &&
			agents.some((entry) => entry.name === args.state.agentName)
		) {
			return (
				agents.find((entry) => entry.name === args.state.agentName) ?? null
			);
		}

		return null;
	})();
	const fallbackAgent = await ensureOpenCodeAgent(args.server, agents);
	const resolvedAgent = resolvedAgentEntry ?? fallbackAgent;

	const providerId =
		args.request.providerId ?? process.env.OMC_OPENCODE_PROVIDER ?? null;
	const modelId =
		args.request.modelId ?? process.env.OMC_OPENCODE_MODEL ?? null;

	if ((providerId && !modelId) || (!providerId && modelId)) {
		throw new Error(
			'OpenCode model override requires both provider_id and model_id',
		);
	}

	if (providerId) {
		await ensureOpenCodeProvider(args.server, providerId);
	}

	return {
		requestedAgent: preferredName,
		agent: resolvedAgent.name,
		agentNative: resolvedAgent.native ?? null,
		providerId,
		modelId,
		modelLabel: currentOpenCodeModelLabel(providerId, modelId),
		meta: {
			requestedAgent: preferredName,
			agent: resolvedAgent.name,
			agentNative: resolvedAgent.native ?? null,
			provider: providerId,
			model: modelId,
		},
	};
}
