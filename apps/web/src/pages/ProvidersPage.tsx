import { useEffect, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import {
  getProviders,
  getConfigProviders,
  type ProviderInfo,
  type ProviderConfig,
} from '../lib/api';

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [pr, cfg] = await Promise.all([
          getProviders(),
          getConfigProviders().catch(() => ({ providers: [] })),
        ]);
        setProviders(pr.providers ?? []);
        setConfigs(cfg.providers ?? []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
    }
    load();
  }, []);

  // Merge config info with provider info
  const merged = providers.map((p) => {
    const cfg = configs.find((c) => c.name === p.name);
    return { ...p, config: cfg };
  });

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold">Providers</h1>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-danger-muted border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {merged.map((p) => (
          <div
            key={p.name}
            className="bg-bg-secondary border border-border rounded-lg p-4 hover:border-border-strong transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-medium text-sm">{p.label}</div>
                <div className="text-xs text-text-tertiary font-mono">{p.name}</div>
              </div>
              <StatusBadge
                variant={p.config?.isConfigured !== false ? 'success' : 'neutral'}
                label={p.config?.isConfigured !== false ? 'Configured' : 'Not configured'}
              />
            </div>

            {p.config?.type && (
              <div className="text-xs text-text-tertiary mb-2">
                Type: <span className="text-text-secondary">{p.config.type}</span>
              </div>
            )}

            {p.config?.baseUrl && (
              <div className="text-xs text-text-tertiary mb-2 truncate">
                URL: <span className="text-text-secondary font-mono">{p.config.baseUrl}</span>
              </div>
            )}

            {p.config?.envVar && (
              <div className="text-xs text-text-tertiary mb-2">
                Key: <span className="text-text-secondary font-mono">{p.config.envVar}</span>
                {p.config.isConfigured ? (
                  <span className="text-success ml-1">set</span>
                ) : (
                  <span className="text-danger ml-1">missing</span>
                )}
              </div>
            )}

            <div className="text-xs text-text-tertiary mt-3 pt-3 border-t border-border">
              {p.models.length} model{p.models.length !== 1 ? 's' : ''}:{' '}
              <span className="text-text-secondary">
                {p.models
                  .slice(0, 3)
                  .map((m) => m.label)
                  .join(', ')}
                {p.models.length > 3 && ` +${p.models.length - 3} more`}
              </span>
            </div>
          </div>
        ))}
      </div>

      {providers.length === 0 && !error && (
        <div className="text-sm text-text-tertiary text-center py-8">
          Loading providers...
        </div>
      )}
    </div>
  );
}
