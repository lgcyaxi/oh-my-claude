/**
 * Registry CRUD API — read/write models-registry.json
 *
 * Endpoints:
 *   GET    /api/registry                           — Read full registry
 *   POST   /api/registry/providers/:name/models    — Add a model
 *   PUT    /api/registry/providers/:name/models    — Replace model list
 *   DELETE /api/registry/providers/:name/models/:id — Remove a model
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { jsonResponse } from './helpers';
import { toErrorMessage } from '../../shared/utils';

interface ModelEntry {
	id: string;
	label: string;
	note?: string;
	realId?: string;
}

interface RegistryProvider {
	name: string;
	label: string;
	models: ModelEntry[];
}

interface Registry {
	$schema?: string;
	$comment?: string;
	providers: RegistryProvider[];
	agents?: Record<string, unknown>;
	categories?: Record<string, unknown>;
	[key: string]: unknown;
}

/** Resolve the installed registry path */
function getRegistryPath(): string {
	return join(homedir(), '.claude', 'oh-my-claude', 'models-registry.json');
}

/** Read registry from disk */
function readRegistry(): Registry {
	const registryPath = getRegistryPath();
	if (!existsSync(registryPath)) {
		throw new Error(`Registry not found at ${registryPath}`);
	}
	return JSON.parse(readFileSync(registryPath, 'utf-8')) as Registry;
}

/** Write registry atomically (write to .tmp then rename) */
function writeRegistry(registry: Registry): void {
	const registryPath = getRegistryPath();
	const tmpPath = registryPath + '.tmp';
	writeFileSync(tmpPath, JSON.stringify(registry, null, '\t') + '\n', 'utf-8');
	renameSync(tmpPath, registryPath);
}

/** Extract provider name and model ID from path */
function parseRegistryPath(path: string): {
	providerName?: string;
	modelId?: string;
} {
	// /api/registry/providers/:name/models/:id
	const match = path.match(
		/^\/api\/registry\/providers\/([^/]+)\/models(?:\/(.+))?$/,
	);
	if (match) {
		return {
			providerName: decodeURIComponent(match[1]!),
			modelId: match[2] ? decodeURIComponent(match[2]) : undefined,
		};
	}
	return {};
}

export async function handleRegistryRequest(
	req: Request,
	path: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	try {
		// GET /api/registry — full registry
		if (path === '/api/registry' && req.method === 'GET') {
			const registry = readRegistry();
			return jsonResponse(registry, 200, corsHeaders);
		}

		const { providerName, modelId } = parseRegistryPath(path);

		if (!providerName) {
			return jsonResponse({ error: 'Invalid registry path' }, 400, corsHeaders);
		}

		const registry = readRegistry();
		const provider = registry.providers.find((p) => p.name === providerName);

		if (!provider) {
			return jsonResponse(
				{ error: `Provider "${providerName}" not found` },
				404,
				corsHeaders,
			);
		}

		switch (req.method) {
			case 'GET': {
				return jsonResponse(
					{ provider: providerName, models: provider.models },
					200,
					corsHeaders,
				);
			}

			case 'POST': {
				// Add a model
				const body = (await req.json()) as Partial<ModelEntry>;
				if (!body.id || !body.label) {
					return jsonResponse(
						{ error: 'Model id and label are required' },
						400,
						corsHeaders,
					);
				}

				// Check for duplicate
				if (provider.models.some((m) => m.id === body.id)) {
					return jsonResponse(
						{ error: `Model "${body.id}" already exists in ${providerName}` },
						409,
						corsHeaders,
					);
				}

				const newModel: ModelEntry = { id: body.id, label: body.label };
				if (body.note) newModel.note = body.note;
				if (body.realId) newModel.realId = body.realId;

				provider.models.push(newModel);
				writeRegistry(registry);

				return jsonResponse({ ok: true, model: newModel }, 201, corsHeaders);
			}

			case 'PUT': {
				// Replace entire model list
				const body = (await req.json()) as { models?: ModelEntry[] };
				if (!Array.isArray(body.models)) {
					return jsonResponse(
						{ error: 'models array is required' },
						400,
						corsHeaders,
					);
				}

				// Validate each model
				for (const m of body.models) {
					if (!m.id || !m.label) {
						return jsonResponse(
							{ error: `Each model needs id and label (got: ${JSON.stringify(m)})` },
							400,
							corsHeaders,
						);
					}
				}

				provider.models = body.models;
				writeRegistry(registry);

				return jsonResponse({ ok: true }, 200, corsHeaders);
			}

			case 'DELETE': {
				if (!modelId) {
					return jsonResponse(
						{ error: 'Model ID required for DELETE' },
						400,
						corsHeaders,
					);
				}

				const idx = provider.models.findIndex((m) => m.id === modelId);
				if (idx === -1) {
					return jsonResponse(
						{ error: `Model "${modelId}" not found in ${providerName}` },
						404,
						corsHeaders,
					);
				}

				provider.models.splice(idx, 1);
				writeRegistry(registry);

				return jsonResponse({ ok: true }, 200, corsHeaders);
			}

			default:
				return jsonResponse(
					{ error: `Method ${req.method} not allowed` },
					405,
					corsHeaders,
				);
		}
	} catch (error) {
		const message = toErrorMessage(error);
		return jsonResponse({ error: message }, 500, corsHeaders);
	}
}
