import { DEFAULT_PROXY_CONFIG } from "../../../../proxy/types";

/**
 * Get the control port from environment variable OMC_PROXY_CONTROL_PORT,
 * or fall back to the default port.
 */
function getControlPort(): number {
  const envPort = process.env.OMC_PROXY_CONTROL_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return DEFAULT_PROXY_CONFIG.controlPort;
}

export async function fetchLocalUsage(): Promise<Record<string, number> | null> {
  try {
    const controlPort = getControlPort();
    const url = `http://localhost:${controlPort}/usage`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(500) });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { providers: Record<string, number> };
    return data.providers ?? null;
  } catch {
    return null;
  }
}
