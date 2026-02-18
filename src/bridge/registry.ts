import type { AIDaemon } from "../daemon";
import type { AIStatus } from "./types";

interface RegistryEntry {
  daemon: AIDaemon;
  lastActivity: Date;
  activeRequest?: string;
}

/**
 * In-memory registry for AI daemon instances and live status metadata.
 */
export class DaemonRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  /**
   * Register a daemon instance under a unique AI name.
   */
  register(name: string, daemon: AIDaemon): void {
    if (this.entries.has(name)) {
      throw new Error(`AI daemon already registered: ${name}`);
    }

    this.entries.set(name, {
      daemon,
      lastActivity: new Date(),
    });
  }

  /**
   * Unregister and optionally stop a daemon.
   */
  async unregister(name: string, options?: { stop?: boolean }): Promise<void> {
    const entry = this.entries.get(name);
    if (!entry) {
      return;
    }

    this.entries.delete(name);

    const shouldStop = options?.stop ?? true;
    if (!shouldStop) {
      return;
    }

    await entry.daemon.stop();
  }

  /**
   * Return a registered daemon by name.
   */
  get(name: string): AIDaemon | undefined {
    return this.entries.get(name)?.daemon;
  }

  /**
   * Return a registered daemon by name or throw.
   */
  getOrThrow(name: string): AIDaemon {
    const daemon = this.get(name);
    if (!daemon) {
      throw new Error(`AI daemon not registered: ${name}`);
    }

    return daemon;
  }

  /**
   * Returns true when a daemon exists for the name.
   */
  has(name: string): boolean {
    return this.entries.has(name);
  }

  /**
   * Update daemon activity timestamp.
   */
  markActivity(name: string, timestamp = new Date()): void {
    const entry = this.entries.get(name);
    if (!entry) {
      return;
    }

    entry.lastActivity = timestamp;
  }

  /**
   * Set the active request tracked for a daemon.
   */
  setActiveRequest(name: string, requestId: string): void {
    const entry = this.entries.get(name);
    if (!entry) {
      return;
    }

    entry.activeRequest = requestId;
  }

  /**
   * Clear active request tracking for a daemon.
   */
  clearActiveRequest(name: string, requestId?: string): void {
    const entry = this.entries.get(name);
    if (!entry) {
      return;
    }

    if (requestId && entry.activeRequest && entry.activeRequest !== requestId) {
      return;
    }

    delete entry.activeRequest;
  }

  /**
   * Return a stable, sorted list of daemon status snapshots.
   */
  listStatuses(): AIStatus[] {
    return [...this.entries.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, entry]) => ({
        name,
        status: entry.daemon.getStatus(),
        activeRequest: entry.activeRequest,
        queueLength: entry.daemon.getQueueLength(),
        lastActivity: new Date(entry.lastActivity),
      }));
  }

  /**
   * Stop and clear all registered daemons.
   */
  async stopAll(): Promise<void> {
    const names = [...this.entries.keys()];

    for (const name of names) {
      await this.unregister(name, { stop: true });
    }
  }
}
