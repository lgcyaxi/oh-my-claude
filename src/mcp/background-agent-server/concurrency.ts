/**
 * Concurrency Manager for background agent execution
 *
 * Implements a semaphore-based concurrency control system to prevent
 * resource exhaustion when running multiple background tasks in parallel.
 *
 * Features:
 * - Per-provider concurrency limits
 * - Global concurrency limit
 * - Queue management with FIFO ordering
 * - Slot tracking for status display
 */

import { loadConfig } from "../../config";

export interface ConcurrencyConfig {
  /** Global maximum concurrent tasks across all providers */
  global: number;
  /** Per-provider limits (provider name -> max concurrent) */
  perProvider: Record<string, number>;
}

// Default concurrency limits
const DEFAULT_LIMITS: ConcurrencyConfig = {
  global: 10,
  perProvider: {
    deepseek: 5,
    zhipu: 5,
    minimax: 3,
    openrouter: 5,
  },
};

// Active task counts
const activeCount = {
  global: 0,
  perProvider: new Map<string, number>(),
};

// Waiting queue: array of { provider, resolve } to release when slot available
interface QueuedTask {
  provider: string;
  resolve: () => void;
}
const waitingQueue: QueuedTask[] = [];

/**
 * Get concurrency limits from config or defaults
 */
function getLimits(): ConcurrencyConfig {
  try {
    const config = loadConfig();
    const concurrency = (config as any).concurrency;
    if (concurrency) {
      return {
        global: concurrency.global ?? DEFAULT_LIMITS.global,
        perProvider: {
          ...DEFAULT_LIMITS.perProvider,
          ...concurrency.per_provider,
        },
      };
    }
  } catch {
    // Use defaults if config loading fails
  }
  return DEFAULT_LIMITS;
}

/**
 * Get the limit for a specific provider
 */
function getProviderLimit(provider: string): number {
  const limits = getLimits();
  return limits.perProvider[provider] ?? 5;
}

/**
 * Get current active count for a provider
 */
function getProviderActiveCount(provider: string): number {
  return activeCount.perProvider.get(provider) ?? 0;
}

/**
 * Check if we can acquire a slot for the given provider
 */
function canAcquire(provider: string): boolean {
  const limits = getLimits();
  const providerActive = getProviderActiveCount(provider);
  const providerLimit = getProviderLimit(provider);

  return activeCount.global < limits.global && providerActive < providerLimit;
}

/**
 * Acquire a concurrency slot for the given provider
 * Returns immediately if slot available, or waits in queue
 */
export async function acquireSlot(provider: string): Promise<void> {
  if (canAcquire(provider)) {
    // Slot available, acquire immediately
    activeCount.global++;
    activeCount.perProvider.set(
      provider,
      getProviderActiveCount(provider) + 1
    );
    return;
  }

  // No slot available, wait in queue
  return new Promise<void>((resolve) => {
    waitingQueue.push({ provider, resolve });
  });
}

/**
 * Release a concurrency slot for the given provider
 * Wakes up next waiting task if any
 */
export function releaseSlot(provider: string): void {
  // Decrement counts
  activeCount.global = Math.max(0, activeCount.global - 1);
  const current = getProviderActiveCount(provider);
  if (current > 0) {
    activeCount.perProvider.set(provider, current - 1);
  }

  // Try to wake up a waiting task
  processQueue();
}

/**
 * Process the waiting queue, starting any tasks that can now run
 */
function processQueue(): void {
  // Process in FIFO order, but skip tasks that still can't run
  let i = 0;
  while (i < waitingQueue.length) {
    const queued = waitingQueue[i];
    if (!queued) break;

    if (canAcquire(queued.provider)) {
      // Remove from queue and start
      waitingQueue.splice(i, 1);
      activeCount.global++;
      activeCount.perProvider.set(
        queued.provider,
        getProviderActiveCount(queued.provider) + 1
      );
      queued.resolve();
      // Don't increment i since we removed an element
    } else {
      i++;
    }
  }
}

/**
 * Get concurrency status for all providers
 */
export function getConcurrencyStatus(): {
  global: { active: number; limit: number; queued: number };
  perProvider: Record<string, { active: number; limit: number; queued: number }>;
} {
  const limits = getLimits();

  // Count queued tasks per provider
  const queuedPerProvider = new Map<string, number>();
  for (const queued of waitingQueue) {
    queuedPerProvider.set(
      queued.provider,
      (queuedPerProvider.get(queued.provider) ?? 0) + 1
    );
  }

  // Build per-provider status
  const perProvider: Record<string, { active: number; limit: number; queued: number }> = {};
  for (const [provider, limit] of Object.entries(limits.perProvider)) {
    perProvider[provider] = {
      active: getProviderActiveCount(provider),
      limit,
      queued: queuedPerProvider.get(provider) ?? 0,
    };
  }

  return {
    global: {
      active: activeCount.global,
      limit: limits.global,
      queued: waitingQueue.length,
    },
    perProvider,
  };
}

/**
 * Get a compact status string for display
 * e.g., "3/10 global | DS: 2/5 | ZP: 1/5"
 */
export function getConcurrencyStatusString(): string {
  const status = getConcurrencyStatus();
  const parts: string[] = [];

  // Global status
  parts.push(`${status.global.active}/${status.global.limit}`);

  // Per-provider status (only show active ones)
  const providerAbbrev: Record<string, string> = {
    deepseek: "DS",
    zhipu: "ZP",
    minimax: "MM",
    openrouter: "OR",
  };

  for (const [provider, info] of Object.entries(status.perProvider)) {
    if (info.active > 0 || info.queued > 0) {
      const abbrev = providerAbbrev[provider] ?? provider.slice(0, 2).toUpperCase();
      let providerStatus = `${abbrev}: ${info.active}/${info.limit}`;
      if (info.queued > 0) {
        providerStatus += ` (+${info.queued})`;
      }
      parts.push(providerStatus);
    }
  }

  return parts.join(" | ");
}

/**
 * Reset all counters (for testing)
 */
export function resetConcurrency(): void {
  activeCount.global = 0;
  activeCount.perProvider.clear();
  waitingQueue.length = 0;
}
