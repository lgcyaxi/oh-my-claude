/**
 * Shared proxy health check
 *
 * Eliminates 3 duplicate checkHealth() definitions across CLI commands.
 */

import http from "node:http";

/**
 * Check proxy health via its control API.
 * @returns Parsed JSON response from /health endpoint
 * @throws Error if proxy is not reachable or returns invalid response
 */
export function checkHealth(controlPort: string | number): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `http://localhost:${controlPort}/health`,
      { timeout: 2000 },
      (res) => {
        let data = "";
        res.on("data", (chunk: string) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error("Invalid JSON"));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}
