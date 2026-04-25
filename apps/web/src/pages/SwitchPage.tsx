import { useEffect, useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import {
  getProviders,
  getInstances,
  switchInstanceModel,
  revertInstance,
  type ProviderInfo,
  type ProxyInstance,
} from '../lib/api';

/** Flattened view: one entry per Claude Code session */
interface SessionView {
  /** Proxy control port (for API forwarding) */
  controlPort: number;
  /** Claude Code session ID (from in-memory session state) */
  sessionId: string;
  /** Proxy instance session ID (from registry) */
  instanceSessionId: string;
  switched: boolean;
  provider?: string;
  model?: string;
  lastActivity: number;
  uptimeHuman?: string;
  requestCount?: number;
}

export default function SwitchPage() {
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // sessionId
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function refresh() {
    try {
      const [pr, inst] = await Promise.all([
        getProviders(),
        getInstances().catch(() => ({ instances: [], summary: { registered: 0, alive: 0, totalSessions: 0, totalRequests: 0 } })),
      ]);
      setProviders(pr.providers ?? []);

      // Flatten: each proxy instance may have multiple Claude Code sessions
      const views: SessionView[] = [];
      for (const instance of (inst.instances ?? []).filter((i: ProxyInstance) => i.alive)) {
        if (instance.sessions.length > 0) {
          for (const s of instance.sessions) {
            views.push({
              controlPort: instance.controlPort,
              sessionId: s.sessionId,
              instanceSessionId: instance.sessionId,
              switched: s.switched,
              provider: s.provider,
              model: s.model,
              lastActivity: s.lastActivity,
              uptimeHuman: instance.health?.uptimeHuman,
              requestCount: instance.health?.requestCount,
            });
          }
        } else {
          // No active sessions yet — show instance-level info
          views.push({
            controlPort: instance.controlPort,
            sessionId: instance.sessionId,
            instanceSessionId: instance.sessionId,
            switched: !!instance.provider,
            provider: instance.provider,
            model: instance.model,
            lastActivity: Date.now(),
            uptimeHuman: instance.health?.uptimeHuman,
            requestCount: instance.health?.requestCount,
          });
        }
      }
      setSessions(views);

      // Auto-select if only one session
      if (views.length === 1 && selected === null) {
        setSelected(views[0]!.sessionId);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  const currentProvider = providers.find((p) => p.name === selectedProvider);
  const models = currentProvider?.models ?? [];

  const selectedSession = sessions.find((s) => s.sessionId === selected);
  const isSwitched = selectedSession?.switched ?? false;
  const currentModel = selectedSession?.model;
  const currentProv = selectedSession?.provider;

  const handleSwitch = async () => {
    if (!selectedSession || !selectedProvider || !selectedModel) return;
    setLoading(true);
    try {
      await switchInstanceModel(selectedSession.controlPort, selectedProvider, selectedModel, selectedSession.sessionId);
      toast(`Switched to ${selectedProvider}/${selectedModel}`, 'success');
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Switch failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async () => {
    if (!selectedSession) return;
    setLoading(true);
    try {
      await revertInstance(selectedSession.controlPort, selectedSession.sessionId);
      toast('Reverted to Anthropic passthrough', 'success');
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Revert failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Live Model Switch</h1>

      {sessions.length === 0 && (
        <div className="text-sm text-text-tertiary text-center py-8 bg-bg-secondary border border-border rounded-lg">
          No active proxy sessions. Start one with <code className="text-text-secondary">omc cc</code>
        </div>
      )}

      {sessions.length > 0 && (
        <>
          {/* Session Selector */}
          <div className="bg-bg-secondary border border-border rounded-lg p-5">
            <span className="text-xs text-text-tertiary uppercase tracking-wider block mb-3">
              Select Session
            </span>
            <div className="space-y-2">
              {sessions.map((s) => {
                const isSelected = s.sessionId === selected;

                return (
                  <button
                    key={s.sessionId}
                    onClick={() => setSelected(s.sessionId)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors flex items-center gap-3 ${
                      isSelected
                        ? 'border-accent bg-accent-muted'
                        : 'border-border hover:border-border-strong'
                    }`}
                  >
                    <StatusBadge
                      variant={s.switched ? 'warning' : 'success'}
                      label={s.switched ? 'Switched' : 'Native'}
                      pulse
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {s.switched ? `${s.provider}/${s.model}` : 'Anthropic (native)'}
                      </div>
                      <div className="text-[10px] text-text-tertiary">
                        {s.uptimeHuman ?? '?'} uptime
                        {' · '}{s.requestCount ?? 0} reqs
                        {' · '}port {s.controlPort}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-text-tertiary">
                      {s.sessionId.slice(0, 8)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current State for selected session */}
          {selectedSession && (
            <div className="bg-bg-secondary border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-tertiary uppercase tracking-wider">
                  Current State
                </span>
                <StatusBadge
                  variant={isSwitched ? 'warning' : 'success'}
                  label={isSwitched ? 'Switched' : 'Passthrough'}
                  pulse
                />
              </div>
              <div className="text-lg font-semibold">
                {isSwitched ? `${currentProv} / ${currentModel}` : 'Anthropic (native)'}
              </div>
            </div>
          )}

          {/* Switch Controls */}
          {selected && (
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
                        {m.note ? `${m.label} · ${m.note}` : m.label}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const selected = models.find((m) => m.id === selectedModel);
                    if (!selected?.note) return null;
                    return (
                      <span className="mt-1 inline-block text-[10px] text-accent/60 bg-accent-muted px-1.5 py-0.5 rounded">
                        {selected.note}
                      </span>
                    );
                  })()}
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

                {isSwitched && (
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
          )}

          <div className="text-xs text-text-tertiary">
            <p>
              Switching routes the selected session's API calls through the chosen provider.
              Each session is controlled independently.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
