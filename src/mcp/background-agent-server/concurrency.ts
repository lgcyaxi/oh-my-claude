/**
 * Concurrency manager for background agent tasks
 *
 * Manages rate limiting per provider to avoid API throttling
 */

import { loadConfig } from "../../config";

interface QueuedTask {
  provider: string;
  execute: () => Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

// Active task counts per provider
const activeCounts = new Map<string, number>();

// Task queues per provider
const queues = new Map<string, QueuedTask[]>();

/**
 * Get concurrency limit for a provider
 */
function getConcurrencyLimit(provider: string): number {
  const config = loadConfig();

  // Check per-provider limit
  const perProvider = config.concurrency.per_provider?.[provider];
  if (perProvider !== undefined) {
    return perProvider;
  }

  // Fall back to default
  return config.concurrency.default;
}

/**
 * Get current active count for a provider
 */
function getActiveCount(provider: string): number {
  return activeCounts.get(provider) ?? 0;
}

/**
 * Increment active count for a provider
 */
function incrementActive(provider: string): void {
  const current = getActiveCount(provider);
  activeCounts.set(provider, current + 1);
}

/**
 * Decrement active count for a provider and process queue
 */
function decrementActive(provider: string): void {
  const current = getActiveCount(provider);
  activeCounts.set(provider, Math.max(0, current - 1));

  // Process next item in queue
  processQueue(provider);
}

/**
 * Process the next item in the queue for a provider
 */
function processQueue(provider: string): void {
  const queue = queues.get(provider);
  if (!queue || queue.length === 0) {
    return;
  }

  const limit = getConcurrencyLimit(provider);
  const active = getActiveCount(provider);

  if (active < limit) {
    const task = queue.shift();
    if (task) {
      incrementActive(provider);

      task
        .execute()
        .then(() => {
          task.resolve();
        })
        .catch((error) => {
          task.reject(error);
        })
        .finally(() => {
          decrementActive(provider);
        });
    }
  }
}

/**
 * Execute a task with concurrency control
 *
 * If the provider is at its concurrency limit, the task will be queued
 */
export async function withConcurrencyLimit<T>(
  provider: string,
  execute: () => Promise<T>
): Promise<T> {
  const limit = getConcurrencyLimit(provider);
  const active = getActiveCount(provider);

  // If under limit, execute immediately
  if (active < limit) {
    incrementActive(provider);
    try {
      return await execute();
    } finally {
      decrementActive(provider);
    }
  }

  // Otherwise, queue the task
  return new Promise<T>((resolve, reject) => {
    const queue = queues.get(provider) ?? [];

    queue.push({
      provider,
      execute: async () => {
        try {
          const result = await execute();
          resolve(result);
        } catch (error) {
          reject(error);
          throw error;
        }
      },
      resolve: () => {}, // Handled in execute
      reject,
    });

    queues.set(provider, queue);
  });
}

/**
 * Get concurrency status for all providers
 */
export function getConcurrencyStatus(): Record<
  string,
  { active: number; limit: number; queued: number }
> {
  const config = loadConfig();
  const status: Record<string, { active: number; limit: number; queued: number }> = {};

  // Get all known providers
  const providers = Object.keys(config.providers);

  for (const provider of providers) {
    status[provider] = {
      active: getActiveCount(provider),
      limit: getConcurrencyLimit(provider),
      queued: queues.get(provider)?.length ?? 0,
    };
  }

  return status;
}

/**
 * Clear all queues (useful for shutdown)
 */
export function clearQueues(): void {
  for (const [provider, queue] of queues) {
    for (const task of queue) {
      task.reject(new Error("Queue cleared"));
    }
  }
  queues.clear();
  activeCounts.clear();
}
