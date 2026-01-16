/**
 * Original agent definitions (MIT Licensed)
 *
 * These are independently created agents with original prompts,
 * not derived from any external source.
 */

export * from "./types";
export { conductorAgent } from "./conductor";
export { sageAgent } from "./sage";
export { archivistAgent } from "./archivist";
export { pathfinderAgent } from "./pathfinder";
export { artisanAgent } from "./artisan";
export { scribeAgent } from "./scribe";
export { sentinelAgent } from "./sentinel";
export { quicksilverAgent } from "./quicksilver";

import type { OriginalAgentDefinition } from "./types";
import { conductorAgent } from "./conductor";
import { sageAgent } from "./sage";
import { archivistAgent } from "./archivist";
import { pathfinderAgent } from "./pathfinder";
import { artisanAgent } from "./artisan";
import { scribeAgent } from "./scribe";
import { sentinelAgent } from "./sentinel";
import { quicksilverAgent } from "./quicksilver";

/**
 * All original agents indexed by name
 */
export const originalAgents: Record<string, OriginalAgentDefinition> = {
  conductor: conductorAgent,
  sage: sageAgent,
  archivist: archivistAgent,
  pathfinder: pathfinderAgent,
  artisan: artisanAgent,
  scribe: scribeAgent,
  sentinel: sentinelAgent,
  quicksilver: quicksilverAgent,
};

/**
 * Get an original agent by name (case-insensitive)
 */
export function getOriginalAgent(name: string): OriginalAgentDefinition | undefined {
  return originalAgents[name.toLowerCase()];
}
