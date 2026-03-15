import { useEffect, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import {
  getStatus,
  getProviders,
  switchModel,
  revertSwitch,
  type StatusResponse,
  type ProviderInfo,
} from '../lib/api';

export default function SwitchPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      const [st, pr] = await Promise.all([getStatus(), getProviders()]);
      setStatus(st);
      setProviders(pr.providers ?? []);
    }
    load();
    const interval = setInterval(async () => {
      try {
        const st = await getStatus();
        setStatus(st);
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const currentProvider = providers.find((p) => p.name === selectedProvider);
  const models = currentProvider?.models ?? [];

  const handleSwitch = async () => {
    if (!selectedProvider || !selectedModel) return;
    setLoading(true);
    try {
      await switchModel(selectedProvider, selectedModel);
      toast(`Switched to ${selectedProvider}/${selectedModel}`, 'success');
      const st = await getStatus();
      setStatus(st);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Switch failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async () => {
    setLoading(true);
    try {
      await revertSwitch();
      toast('Reverted to Anthropic passthrough', 'success');
      const st = await getStatus();
      setStatus(st);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Revert failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Live Model Switch</h1>

      {/* Current State */}
      <div className="bg-bg-secondary border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-tertiary uppercase tracking-wider">
            Current State
          </span>
          <StatusBadge
            variant={status?.switched ? 'warning' : 'success'}
            label={status?.switched ? 'Switched' : 'Passthrough'}
            pulse
          />
        </div>
        <div className="text-lg font-semibold">
          {status?.switched
            ? `${status.provider} / ${status.model}`
            : 'Anthropic (native)'}
        </div>
        {status?.switched && status.switchedAt && (
          <div className="text-xs text-text-tertiary mt-1">
            Switched at {new Date(status.switchedAt).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Switch Controls */}
      <div className="bg-bg-secondary border border-border rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-medium text-text-secondary">Switch Model</h2>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-text-tertiary mb-1 block">Provider</span>
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                setSelectedModel('');
              }}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary outline-none focus:border-accent/50"
            >
              <option value="">Select provider...</option>
              {providers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-text-tertiary mb-1 block">Model</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={!selectedProvider}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary outline-none focus:border-accent/50 disabled:opacity-50"
            >
              <option value="">Select model...</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSwitch}
            disabled={!selectedProvider || !selectedModel || loading}
            className="px-5 py-2.5 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-40"
          >
            {loading ? 'Switching...' : 'Switch'}
          </button>

          {status?.switched && (
            <button
              onClick={handleRevert}
              disabled={loading}
              className="px-5 py-2.5 text-sm font-medium border border-border text-text-secondary rounded hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-40"
            >
              Revert to Anthropic
            </button>
          )}
        </div>
      </div>

      {/* Provider Quick Reference */}
      <div className="text-xs text-text-tertiary">
        <p>
          Switching routes all Claude Code API calls through the selected provider.
          Revert to restore native Anthropic passthrough.
        </p>
      </div>
    </div>
  );
}
