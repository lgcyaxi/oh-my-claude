/**
 * Resolve the control API port from environment.
 *
 * `oh-my-claude cc` sets OMC_PROXY_CONTROL_PORT to the per-session proxy's control port.
 * Returns undefined when proxy is not available (plain `claude` without `oh-my-claude cc`).
 */
export function resolveControlPort(): number | undefined {
  const envPort = process.env.OMC_PROXY_CONTROL_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

/**
 * Build the control API URL with optional session query parameter.
 * Returns null if proxy control port is not available.
 */
export function controlUrl(path: string, sessionId?: string): string | null {
  const port = resolveControlPort();
  if (!port) return null;
  const base = `http://localhost:${port}${path}`;
  return sessionId ? `${base}?session=${sessionId}` : base;
}
