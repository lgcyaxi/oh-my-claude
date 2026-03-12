/**
 * Shared helpers for control API modules
 */

/** Create a JSON response with optional extra headers */
export function jsonResponse(
	data: unknown,
	status: number,
	extraHeaders?: Record<string, string>,
): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: {
			'content-type': 'application/json',
			...extraHeaders,
		},
	});
}

/** Format uptime as human-readable string */
export function formatUptime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	}
	return `${seconds}s`;
}
