import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import {
  getHealth,
  getProviders,
  getInstances,
  getMemories,
  getPreferences,
  getUsage,
  type HealthResponse,
  type ProviderInfo,
  type ProxyInstance,
  type InstancesSummary,
  type ProviderUsage,
} from '../lib/api';

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [memoryCount, setMemoryCount] = useState({ omc: 0, global: 0, auto: 0 });
  const [prefCount, setPrefCount] = useState(0);
  const [instances, setInstances] = useState<ProxyInstance[]>([]);
  const [summary, setSummary] = useState<InstancesSummary | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [usage, setUsage] = useState<ProviderUsage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let errorCount = 0;
    let timerId: ReturnType<typeof setTimeout>;

    const POLL_NORMAL = 5_000;
    const POLL_BACKOFF = 15_000;
    const ERROR_THRESHOLD = 3;

    async function refresh() {
      try {
        const [h, pr, inst, mem, pref, usg] = await Promise.all([
          getHealth(),
          getProviders(),
          getInstances().catch(() => ({ instances: [], summary: { registered: 0, alive: 0, totalSessions: 0, totalRequests: 0 } })),
          getMemories().catch(() => ({ global: [], project: [], omcProject: [], total: 0 })),
          getPreferences().catch(() => ({ preferences: [] })),
          getUsage().catch(() => ({ providers: [], cached: false })),
        ]);
        if (!active) return;
        setHealth(h);
        setProviders(pr.providers ?? []);
        setInstances(inst.instances ?? []);
        setSummary(inst.summary ?? null);
        setMemoryCount({
          omc: (mem.omcProject ?? []).length,
          global: mem.global.length,
          auto: mem.project.length,
        });
        setPrefCount(pref.preferences.length);
        setUsage(usg.providers.filter((p: ProviderUsage) => p.configured));
        setError(null);
        errorCount = 0;
      } catch (err) {
        if (!active) return;
        errorCount++;
        setError(err instanceof Error ? err.message : 'Connection failed');
      }
      if (active) {
        const delay = errorCount >= ERROR_THRESHOLD ? POLL_BACKOFF : POLL_NORMAL;
        timerId = setTimeout(refresh, delay);
      }
    }

    refresh();
    return () => {
      active = false;
      clearTimeout(timerId);
    };
  }, []);

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger-muted border border-danger/20 text-danger text-sm">
          Proxy unreachable: {error}
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Dashboard Proxy */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Dashboard
            </span>
            <StatusBadge
              variant={health ? 'success' : 'neutral'}
              label={health ? 'Running' : 'Unknown'}
              pulse={!!health}
            />
          </div>
          <div className="text-2xl font-semibold font-mono">
            {health?.uptimeHuman ?? '--'}
          </div>
          <div className="text-xs text-text-tertiary mt-1">
            Control server on :18911
          </div>
        </div>

        {/* Active Proxies — per-session proxy instances */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Active Proxies
            </span>
            {(summary?.alive ?? 0) > 0 && (
              <StatusBadge variant="success" label={`${summary!.alive} alive`} pulse />
            )}
          </div>
          <div className="text-2xl font-semibold font-mono">
            {summary?.alive ?? 0}
          </div>
          <div className="text-xs text-text-tertiary mt-1">
            {(summary?.totalRequests ?? 0) > 0
              ? `${summary!.totalRequests} total requests`
              : 'cc sessions with proxy'}
          </div>
        </div>

        {/* Session History */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              History
            </span>
          </div>
          <div className="text-lg font-semibold">
            Browse Sessions
          </div>
          <Link
            to="/sessions"
            className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
          >
            View conversations →
          </Link>
        </div>
      </div>

      {/* Memory & Preferences */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              OMC Memory
            </span>
          </div>
          <div className="text-2xl font-semibold font-mono">
            {memoryCount.omc}
          </div>
          <Link to="/memory" className="text-xs text-accent hover:text-accent-hover mt-1 inline-block">
            Browse memories →
          </Link>
        </div>

        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              CC Memory
            </span>
          </div>
          <div className="text-2xl font-semibold font-mono">
            {memoryCount.auto + memoryCount.global}
          </div>
          <Link to="/cc-memory" className="text-xs text-accent hover:text-accent-hover mt-1 inline-block">
            View auto-memory →
          </Link>
        </div>

        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Preferences
            </span>
          </div>
          <div className="text-2xl font-semibold font-mono">
            {prefCount}
          </div>
          <Link to="/preferences" className="text-xs text-accent hover:text-accent-hover mt-1 inline-block">
            Manage rules →
          </Link>
        </div>
      </div>

      {/* Provider Usage/Quota */}
      {usage.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-text-secondary mb-3">
            Provider Usage
          </h2>
          <div className="grid grid-cols-5 gap-3">
            {usage.map((u) => {
              const colorClass = u.color === 'critical' ? 'text-danger'
                : u.color === 'warning' ? 'text-warning'
                : 'text-success';
              const borderClass = u.color === 'critical' ? 'border-danger/30'
                : u.color === 'warning' ? 'border-warning/30'
                : 'border-border';
              return (
                <div
                  key={u.key}
                  className={`bg-bg-secondary border ${borderClass} rounded-lg p-3`}
                >
                  <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">
                    {u.key}
                  </div>
                  <div className={`text-lg font-semibold font-mono ${colorClass}`}>
                    {u.display || '--'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Sessions — each per-session proxy = 1 session */}
      {instances.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-text-secondary mb-3">
            Active Sessions
          </h2>
          <div className="bg-bg-secondary border border-border rounded-lg divide-y divide-border">
            {instances.map((inst) => {
              const session = inst.sessions[0];
              const isSwitched = session?.switched ?? !!inst.provider;
              const provider = session?.provider ?? inst.provider;
              const model = session?.model ?? inst.model;

              return (
                <div key={inst.controlPort} className="px-4 py-3 flex items-center gap-3">
                  <StatusBadge
                    variant={!inst.alive ? 'danger' : isSwitched ? 'warning' : 'success'}
                    label={!inst.alive ? 'Dead' : isSwitched ? 'Switched' : 'Passthrough'}
                    pulse={inst.alive}
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">
                      {isSwitched
                        ? `${provider}/${model}`
                        : 'Anthropic (native)'}
                    </span>
                    <span className="text-[10px] text-text-tertiary">
                      {inst.health?.uptimeHuman ?? '?'} uptime
                      {' · '}{inst.health?.requestCount ?? 0} reqs
                      {' · '}PID {inst.pid}
                    </span>
                  </div>
                  <Link
                    to="/switch"
                    className="text-[10px] text-accent hover:text-accent-hover shrink-0"
                  >
                    Switch →
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {instances.length === 0 && !error && (
        <div className="text-sm text-text-tertiary text-center py-6 bg-bg-secondary border border-border rounded-lg">
          No active cc sessions. Start one with <code className="text-text-secondary">omc cc</code>
        </div>
      )}

      {/* Providers Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-text-secondary">Providers</h2>
          <Link
            to="/providers"
            className="text-xs text-accent hover:text-accent-hover"
          >
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {providers.map((p) => (
            <div
              key={p.name}
              className="bg-bg-secondary border border-border rounded-lg p-3 hover:border-border-strong transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{p.label}</span>
                <StatusBadge variant="success" label="Active" />
              </div>
              <div className="text-xs text-text-tertiary">
                {p.models.length} model{p.models.length !== 1 ? 's' : ''}
              </div>
            </div>
          ))}
          {providers.length === 0 && !error && (
            <div className="col-span-4 text-sm text-text-tertiary py-4 text-center">
              Loading providers...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
