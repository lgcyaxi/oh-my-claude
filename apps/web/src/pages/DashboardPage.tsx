import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import {
  getHealth,
  getStatus,
  getSessions,
  getProviders,
  type HealthResponse,
  type StatusResponse,
  type Session,
  type ProviderInfo,
} from '../lib/api';

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const [h, st, se, pr] = await Promise.all([
          getHealth(),
          getStatus(),
          getSessions(),
          getProviders(),
        ]);
        if (!active) return;
        setHealth(h);
        setStatus(st);
        setSessions(se.sessions ?? []);
        setProviders(pr.providers ?? []);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Connection failed');
      }
    }

    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(interval);
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
        {/* Proxy Health */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Proxy
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
            {health ? `${health.requestCount} requests` : 'No data'}
          </div>
        </div>

        {/* Current Mode */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Mode
            </span>
            <StatusBadge
              variant={status?.switched ? 'warning' : 'success'}
              label={status?.switched ? 'Switched' : 'Passthrough'}
            />
          </div>
          <div className="text-lg font-semibold truncate">
            {status?.switched
              ? `${status.provider}/${status.model}`
              : 'Anthropic'}
          </div>
          <Link
            to="/switch"
            className="text-xs text-accent hover:text-accent-hover mt-1 inline-block"
          >
            Change model →
          </Link>
        </div>

        {/* Active Sessions */}
        <div className="bg-bg-secondary border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-tertiary uppercase tracking-wider">
              Sessions
            </span>
          </div>
          <div className="text-2xl font-semibold font-mono">
            {sessions.length}
          </div>
          <div className="text-xs text-text-tertiary mt-1">active proxy sessions</div>
        </div>
      </div>

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

      {/* Active Sessions List */}
      {sessions.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-text-secondary mb-3">
            Active Sessions
          </h2>
          <div className="bg-bg-secondary border border-border rounded-lg divide-y divide-border">
            {sessions.map((s) => (
              <div key={s.sessionId} className="px-4 py-3 flex items-center gap-3">
                <StatusBadge
                  variant={s.switched ? 'warning' : 'success'}
                  label={s.switched ? 'Switched' : 'Passthrough'}
                />
                <span className="text-xs font-mono text-text-secondary truncate flex-1">
                  {s.sessionId}
                </span>
                {s.provider && (
                  <span className="text-xs text-text-tertiary">
                    {s.provider}/{s.model}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
