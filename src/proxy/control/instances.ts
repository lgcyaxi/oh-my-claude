/**
 * Instance aggregation API for the web dashboard
 *
 * GET /api/instances — List all registered proxy instances with live health/session data
 *
 * Reads the shared proxy-instances.json registry and queries each instance's
 * /health and /sessions endpoints to build an aggregated view.
 */

import {
	readInstances,
	deregisterInstance,
	type ProxyInstance,
} from '../state/instance-registry';
import { jsonResponse } from './helpers';

export interface AggregatedInstance extends ProxyInstance {
	/** Is the instance actually reachable? */
	alive: boolean;
	/** Health data from /health */
	health?: {
		uptime: number;
		uptimeHuman: string;
		requestCount: number;
		activeSessions: number;
	};
	/** Active sessions from /sessions */
	sessions: Array<{
		sessionId: string;
		switched: boolean;
		provider?: string;
		model?: string;
		lastActivity: number;
	}>;
}

/** Query a single instance's control port for live data */
async function probeInstance(
	instance: ProxyInstance,
): Promise<AggregatedInstance> {
	const base = `http://localhost:${instance.controlPort}`;
	const timeout = 2000;

	try {
		const [healthRes, sessionsRes] = await Promise.all([
			fetch(`${base}/health`, { signal: AbortSignal.timeout(timeout) }),
			fetch(`${base}/sessions`, { signal: AbortSignal.timeout(timeout) }),
		]);

		const health = healthRes.ok ? await healthRes.json() : undefined;
		const sessionsData = sessionsRes.ok ? await sessionsRes.json() : { sessions: [] };

		return {
			...instance,
			alive: true,
			health: health as AggregatedInstance['health'],
			sessions: (sessionsData as { sessions: AggregatedInstance['sessions'] }).sessions ?? [],
		};
	} catch {
		return {
			...instance,
			alive: false,
			sessions: [],
		};
	}
}

export async function handleInstancesRequest(
	_req: Request,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const registered = readInstances();

	// Probe all instances in parallel
	const allInstances = await Promise.all(registered.map(probeInstance));

	// Clean up dead instances from registry
	const deadInstances = allInstances.filter((i) => !i.alive);
	for (const dead of deadInstances) {
		deregisterInstance(dead.sessionId);
	}

	// Only return alive instances to the dashboard
	const instances = allInstances.filter((i) => i.alive);

	// Aggregate totals
	const totalSessions = instances.reduce(
		(sum, i) => sum + i.sessions.length,
		0,
	);
	const totalRequests = instances.reduce(
		(sum, i) => sum + (i.health?.requestCount ?? 0),
		0,
	);
	const aliveCount = instances.length;

	return jsonResponse(
		{
			instances,
			summary: {
				registered: registered.length,
				alive: aliveCount,
				totalSessions,
				totalRequests,
			},
		},
		200,
		corsHeaders,
	);
}
