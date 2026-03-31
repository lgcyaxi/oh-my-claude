import { useEffect, useState } from 'react';
import {
  getProviders,
  getProjects,
  getProjectSessions,
  aiRenameSession,
  runMemoryOperation,
  type ProviderInfo,
  type ProjectEntry,
} from '../lib/api';

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  // AI Rename state
  const [renameProject, setRenameProject] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameProgress, setRenameProgress] = useState('');
  const [renameResults, setRenameResults] = useState<Array<{ id: string; summary: string; error?: string }>>([]);

  // Memory operations state
  const [memOpRunning, setMemOpRunning] = useState<string | null>(null);
  const [memOpProgress, setMemOpProgress] = useState('');
  const [memOpResult, setMemOpResult] = useState<string | null>(null);
  const [memOpProject, setMemOpProject] = useState('');
  const [memProvider, setMemProvider] = useState('');
  const [memModel, setMemModel] = useState('');

  // Two-phase state: pending execute data from analyze phase
  const [pendingExecute, setPendingExecute] = useState<{
    action: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
  } | null>(null);

  // Type filter for compact/summarize
  const [memTypeFilter, setMemTypeFilter] = useState('note'); // compact default: note
  const [sumTypeFilter, setSumTypeFilter] = useState('all'); // summarize default: all

  function getMemOpOptions() {
    const projectPath = memOpProject
      ? projects.find((p) => p.folder === memOpProject)?.projectPath
      : undefined;
    const provider = memProvider || selectedProvider;
    const model = memModel || selectedModel;
    return { provider: provider || undefined, model: model || undefined, projectPath };
  }

  async function handleMemOp(action: string) {
    setMemOpRunning(action);
    setMemOpResult(null);
    setPendingExecute(null);

    const actionLabels: Record<string, string> = {
      compact: 'Analyzing memories for merge candidates',
      daily: 'Consolidating same-date session notes',
      summarize: 'Generating timeline summary from recent memories',
      clear: 'Identifying outdated or redundant memories',
    };
    setMemOpProgress(actionLabels[action] ?? 'Processing...');

    try {
      const opts = getMemOpOptions();
      const provider = opts.provider || 'auto';
      const model = opts.model || 'default';
      setMemOpProgress(`${actionLabels[action]}... (using ${provider}/${model})`);

      const result = await runMemoryOperation(action, {
        ...opts,
        days: 7,
        mode: action === 'daily' ? undefined : 'analyze',
        // Pass type filter for compact and summarize
        ...(action === 'compact' ? { type: memTypeFilter } : {}),
        ...(action === 'summarize' ? { type: sumTypeFilter } : {}),
      });

      // Daily is single-phase (auto-executes)
      if (action === 'daily') {
        const doneMsg = result.datesProcessed
          ? `Done! Consolidated ${result.memoriesAnalyzed} sessions across ${result.datesProcessed} dates via ${result.provider}/${result.model}`
          : `Done! Analyzed ${result.memoriesAnalyzed} memories via ${result.provider}/${result.model}`;
        setMemOpProgress(doneMsg);
        setMemOpResult(result.analysis);
      } else {
        // Two-phase: show analysis and prepare execute data
        setMemOpProgress(`Analyzed ${result.memoriesAnalyzed} memories via ${result.provider}/${result.model} — review below and click Execute`);
        setMemOpResult(result.analysis);

        // Store parsed data for execute phase
        if (action === 'compact' && result.groups?.length > 0) {
          setPendingExecute({ action, data: { groups: result.groups } });
        } else if (action === 'clear' && result.candidates?.length > 0) {
          setPendingExecute({ action, data: { ids: result.candidates.map((c: { id: string }) => c.id) } });
        } else if (action === 'summarize' && result.suggestedSummary) {
          setPendingExecute({ action, data: {
            summary: result.suggestedSummary,
            title: result.suggestedTitle,
            tags: result.suggestedTags,
            originalIds: result.originalIds,
          } });
        }
      }
    } catch (err) {
      setMemOpProgress('');
      setMemOpResult(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    }
    setMemOpRunning(null);
  }

  async function handleExecute() {
    if (!pendingExecute) return;
    const { action, data } = pendingExecute;

    setMemOpRunning(`${action}-execute`);
    setMemOpProgress(`Executing ${action}...`);

    try {
      const opts = getMemOpOptions();
      const result = await runMemoryOperation(action, {
        ...opts,
        ...data,
        mode: 'execute',
      });

      setMemOpProgress(`Done! ${action} executed successfully`);
      setMemOpResult(result.analysis);
      setPendingExecute(null);
    } catch (err) {
      setMemOpProgress('');
      setMemOpResult(`Execute error: ${err instanceof Error ? err.message : 'Failed'}`);
    }
    setMemOpRunning(null);
  }

  useEffect(() => {
    Promise.all([getProviders(), getProjects()]).then(([pr, proj]) => {
      // Filter out Anthropic — dashboard runs outside CC, no subscription access
      const nonAnthropicProviders = (pr.providers ?? []).filter(
        (p) => p.name !== 'anthropic' && p.name !== 'claude',
      );
      setProviders(nonAnthropicProviders);
      setProjects(proj.projects ?? []);
      // Default to zhipu/glm-5 if available
      if (!selectedProvider) {
        const zhipu = nonAnthropicProviders.find((p) => p.name === 'zhipu');
        if (zhipu) {
          setSelectedProvider('zhipu');
          setSelectedModel('glm-5');
        } else if (nonAnthropicProviders.length > 0) {
          setSelectedProvider(nonAnthropicProviders[0]!.name);
        }
      }
    });
  }, []);

  const currentProvider = providers.find((p) => p.name === selectedProvider);
  const models = currentProvider?.models ?? [];

  async function handleBulkRename() {
    if (!renameProject) return;
    setRenaming(true);
    setRenameResults([]);
    setRenameProgress('Loading sessions...');

    try {
      const data = await getProjectSessions(renameProject);
      // Only rename sessions that have a firstPrompt but no summary
      const candidates = data.sessions.filter(
        (s) => s.firstPrompt && !s.summary,
      );

      if (candidates.length === 0) {
        setRenameProgress('No sessions need renaming (all already have summaries)');
        setRenaming(false);
        return;
      }

      setRenameProgress(`Renaming ${candidates.length} sessions...`);
      const results: Array<{ id: string; summary: string; error?: string }> = [];

      for (let i = 0; i < candidates.length; i++) {
        const s = candidates[i]!;
        setRenameProgress(`Renaming ${i + 1}/${candidates.length}: ${s.sessionId.slice(0, 8)}...`);

        try {
          const result = await aiRenameSession(
            renameProject,
            s.sessionId,
            selectedProvider || undefined,
            selectedModel || undefined,
          );
          results.push({ id: s.sessionId, summary: result.summary });
        } catch (err) {
          results.push({
            id: s.sessionId,
            summary: '',
            error: err instanceof Error ? err.message : 'Failed',
          });
        }

        setRenameResults([...results]);
      }

      setRenameProgress(`Done! Renamed ${results.filter((r) => !r.error).length}/${candidates.length} sessions`);
    } catch (err) {
      setRenameProgress(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setRenaming(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* AI Session Rename */}
      <div className="bg-bg-secondary border border-border rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-text-primary">AI Session Rename</h2>
          <p className="text-xs text-text-tertiary mt-1">
            Use a configured AI provider to auto-generate concise titles for sessions that don't have summaries.
            Reads the first few messages of each conversation and generates a 5-10 word title.
          </p>
        </div>

        {/* Provider/Model selection */}
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
              <option value="">Default</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Project selector + Run */}
        <div className="flex gap-3 items-end">
          <label className="flex-1">
            <span className="text-xs text-text-tertiary mb-1 block">Project</span>
            <select
              value={renameProject}
              onChange={(e) => setRenameProject(e.target.value)}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary outline-none focus:border-accent/50"
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.folder} value={p.folder}>
                  {p.projectPath} ({p.sessionCount} sessions)
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={handleBulkRename}
            disabled={!renameProject || renaming}
            className="px-5 py-2 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-40 shrink-0"
          >
            {renaming ? 'Renaming...' : 'Auto-Rename'}
          </button>
        </div>

        {/* Progress */}
        {renameProgress && (
          <div className="text-xs text-text-secondary bg-bg-tertiary rounded px-3 py-2">
            {renameProgress}
          </div>
        )}

        {/* Results */}
        {renameResults.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1">
            {renameResults.map((r) => (
              <div
                key={r.id}
                className={`text-xs px-2 py-1 rounded ${
                  r.error
                    ? 'bg-danger-muted text-danger'
                    : 'bg-success-muted text-success'
                }`}
              >
                <span className="font-mono">{r.id.slice(0, 8)}</span>
                {' → '}
                {r.error ? r.error : r.summary}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Memory Operations */}
      <div className="bg-bg-secondary border border-border rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-text-primary">Memory Operations</h2>
          <p className="text-xs text-text-tertiary mt-1">
            AI-powered memory maintenance. Compact/Clear/Summarize use a two-phase flow: Analyze first, then Execute to apply.
            Daily auto-executes (consolidates same-date sessions immediately).
          </p>
        </div>

        {/* Provider/Model for memory ops */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-text-tertiary mb-1 block">Provider</span>
            <select
              value={memProvider}
              onChange={(e) => { setMemProvider(e.target.value); setMemModel(''); }}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary outline-none focus:border-accent/50"
            >
              <option value="">Same as above</option>
              {providers.map((p) => (
                <option key={p.name} value={p.name}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-text-tertiary mb-1 block">Model</span>
            <select
              value={memModel}
              onChange={(e) => setMemModel(e.target.value)}
              disabled={!memProvider && !selectedProvider}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary outline-none focus:border-accent/50 disabled:opacity-50"
            >
              <option value="">Default</option>
              {(memProvider ? providers.find((p) => p.name === memProvider)?.models : currentProvider?.models)?.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              )) ?? null}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block col-span-1">
            <span className="text-xs text-text-tertiary mb-1 block">Scope</span>
            <select
              value={memOpProject}
              onChange={(e) => setMemOpProject(e.target.value)}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary outline-none focus:border-accent/50"
            >
              <option value="">All memories</option>
              {projects.map((p) => (
                <option key={p.folder} value={p.folder}>
                  {p.projectPath}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-text-tertiary mb-1 block">Compact type</span>
            <select
              value={memTypeFilter}
              onChange={(e) => setMemTypeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary outline-none focus:border-accent/50"
            >
              <option value="note">Notes only</option>
              <option value="session">Sessions only</option>
              <option value="all">All types</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-text-tertiary mb-1 block">Summarize type</span>
            <select
              value={sumTypeFilter}
              onChange={(e) => setSumTypeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm text-text-primary outline-none focus:border-accent/50"
            >
              <option value="all">All types</option>
              <option value="note">Notes only</option>
              <option value="session">Sessions only</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleMemOp('compact')}
            disabled={memOpRunning !== null}
            className="border border-border rounded-lg p-3 text-left hover:border-accent/50 transition-colors disabled:opacity-50"
          >
            <div className="text-xs font-medium mb-1">
              {memOpRunning === 'compact' ? 'Analyzing...' : 'Compact'}
            </div>
            <p className="text-[10px] text-text-tertiary">Analyze → merge similar memories into consolidated notes</p>
          </button>
          <button
            onClick={() => handleMemOp('daily')}
            disabled={memOpRunning !== null}
            className="border border-border rounded-lg p-3 text-left hover:border-accent/50 transition-colors disabled:opacity-50"
          >
            <div className="text-xs font-medium mb-1">
              {memOpRunning === 'daily' ? 'Generating...' : 'Daily'}
            </div>
            <p className="text-[10px] text-text-tertiary">Consolidate same-date sessions into narratives, delete originals</p>
          </button>
          <button
            onClick={() => handleMemOp('summarize')}
            disabled={memOpRunning !== null}
            className="border border-border rounded-lg p-3 text-left hover:border-accent/50 transition-colors disabled:opacity-50"
          >
            <div className="text-xs font-medium mb-1">
              {memOpRunning === 'summarize' ? 'Analyzing...' : 'Summarize'}
            </div>
            <p className="text-[10px] text-text-tertiary">Analyze → generate timeline summary, delete originals</p>
          </button>
          <button
            onClick={() => handleMemOp('clear')}
            disabled={memOpRunning !== null}
            className="border border-border rounded-lg p-3 text-left hover:border-accent/50 transition-colors disabled:opacity-50"
          >
            <div className="text-xs font-medium mb-1">
              {memOpRunning === 'clear' ? 'Analyzing...' : 'Clear'}
            </div>
            <p className="text-[10px] text-text-tertiary">Analyze → identify and delete outdated/redundant memories</p>
          </button>
        </div>

        {/* Progress */}
        {memOpProgress && (
          <div className="text-xs text-text-secondary bg-bg-tertiary rounded px-3 py-2">
            {memOpRunning && <span className="inline-block animate-pulse mr-1.5">●</span>}
            {memOpProgress}
          </div>
        )}

        {/* Execute button — shown after analyze phase for two-phase ops */}
        {pendingExecute && !memOpRunning && (
          <div className="flex gap-3 items-center">
            <button
              onClick={handleExecute}
              className="px-5 py-2 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover transition-colors"
            >
              Execute {pendingExecute.action === 'compact'
                ? `(merge ${pendingExecute.data.groups?.length ?? 0} groups)`
                : pendingExecute.action === 'clear'
                  ? `(delete ${pendingExecute.data.ids?.length ?? 0} memories)`
                  : `(save summary, delete ${pendingExecute.data.originalIds?.length ?? 0} originals)`}
            </button>
            <button
              onClick={() => { setPendingExecute(null); setMemOpProgress('Cancelled.'); }}
              className="px-3 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Operation result */}
        {memOpResult && (
          <div className="bg-bg-tertiary border border-border rounded-lg p-3 max-h-64 overflow-y-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap text-text-secondary">{memOpResult}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
