/**
 * Background usage poller — runs inside the proxy daemon process.
 *
 * Polls all configured providers every 60s and writes fresh data to
 * ~/.config/oh-my-claude/usage-cache.json. This decouples API polling
 * from statusline rendering, making renders instant (zero HTTP calls)
 * when the proxy is running.
 *
 * Graceful degradation: if the proxy isn't running, the statusline
 * falls back to inline fetching when cache entries expire.
 */

import { buildProviderRegistry } from "../integration/statusline/segments/usage/provider-registry";
import { fetchAllProviders } from "../integration/statusline/segments/usage/orchestrator";
import { readCache, writeCache } from "../integration/statusline/segments/usage/cache";
import { recordSnapshots } from "../integration/statusline/segments/usage/history";
import { pollAndCacheClaudeUsage } from "./claude-usage";

/** Daemon fetch timeout (5s, more generous than inline 2s) */
const DAEMON_TIMEOUT_MS = 5000;

export class UsagePoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

  constructor(private intervalMs = 60_000) {}

  start(): void {
    this.poll(); // Immediate first poll
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return; // Skip if previous poll still running
    this.polling = true;
    try {
      const registry = buildProviderRegistry();
      const cache = readCache();
      const { parts, cacheModified, updatedCache } = await fetchAllProviders(
        registry,
        cache,
        DAEMON_TIMEOUT_MS
      );
      if (cacheModified) {
        writeCache(updatedCache);
      }
      // Record snapshots for trend history
      if (parts.length > 0) {
        recordSnapshots(parts);
      }

      // Poll Claude subscription usage (write to separate cache file)
      pollAndCacheClaudeUsage(DAEMON_TIMEOUT_MS).catch(() => {});
    } catch (err) {
      console.error("[usage-poller] Poll error:", err);
    } finally {
      this.polling = false;
    }
  }
}
