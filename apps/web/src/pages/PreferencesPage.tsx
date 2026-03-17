import { useEffect, useState } from 'react';
import {
  getPreferences,
  addPreference,
  deletePreference,
  getProjects,
  type PreferenceEntry,
  type ProjectEntry,
} from '../lib/api';

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<(PreferenceEntry & { scope?: string; project?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectEntry[]>([]);

  // Add form
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newAlways, setNewAlways] = useState(true);
  const [newKeywords, setNewKeywords] = useState('');
  const [newScope, setNewScope] = useState(''); // empty = global, else projectPath
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const [prefData, projData] = await Promise.all([getPreferences(), getProjects()]);
      setPrefs(prefData.preferences as (PreferenceEntry & { scope?: string; project?: string })[]);
      setProjects(projData.projects);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const selected = prefs.find((p) => p.id === selectedId);

  async function handleAdd() {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      await addPreference({
        title: newTitle.trim(),
        content: newContent.trim(),
        tags: newTags ? newTags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        autoInject: true,
        trigger: newAlways
          ? { always: true }
          : { keywords: newKeywords.split(',').map((k) => k.trim()).filter(Boolean) },
        projectPath: newScope || undefined,
      });
      setShowAdd(false);
      setNewTitle('');
      setNewContent('');
      setNewTags('');
      setNewKeywords('');
      refresh();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    try {
      await deletePreference(id);
      setConfirmDelete(null);
      if (selectedId === id) setSelectedId(null);
      refresh();
    } catch { /* ignore */ }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-text-tertiary">Loading...</div>;
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-3rem)]">
      {/* Left: preference list */}
      <div className="w-72 shrink-0 flex flex-col bg-bg-secondary border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-xs text-text-tertiary uppercase tracking-wider">
            Preferences ({prefs.length})
          </span>
          <button
            onClick={() => { setShowAdd(!showAdd); setSelectedId(null); }}
            className="text-[10px] text-accent hover:text-accent-hover"
          >
            {showAdd ? 'Cancel' : '+ Add'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {prefs.map((p) => (
            <div
              key={p.id}
              className={`group border-b border-border/50 ${
                selectedId === p.id ? 'bg-accent-muted' : 'hover:bg-bg-hover'
              }`}
            >
              {confirmDelete === p.id ? (
                <div className="px-3 py-2">
                  <div className="text-[11px] text-danger mb-1">Delete?</div>
                  <div className="flex gap-1.5">
                    <button onClick={() => handleDelete(p.id)} className="px-2 py-0.5 text-[10px] bg-danger text-white rounded">Delete</button>
                    <button onClick={() => setConfirmDelete(null)} className="px-2 py-0.5 text-[10px] border border-border text-text-secondary rounded">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center">
                  <button
                    onClick={() => { setSelectedId(p.id); setShowAdd(false); }}
                    className={`flex-1 text-left px-3 py-2 min-w-0 ${
                      selectedId === p.id ? 'text-accent-hover' : 'text-text-secondary'
                    }`}
                  >
                    <div className="text-[12px] font-medium truncate">{p.title}</div>
                    <div className="flex gap-1 mt-0.5">
                      <span className={`text-[9px] px-1 rounded ${
                        p.scope === 'project' ? 'bg-warning-muted text-warning' : 'bg-accent-muted text-accent'
                      }`}>{p.scope ?? 'global'}</span>
                      {p.project && (
                        <span className="text-[9px] text-text-tertiary font-mono">{p.project}</span>
                      )}
                      {p.trigger?.always && (
                        <span className="text-[9px] text-text-tertiary">always</span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => setConfirmDelete(p.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 mr-1 text-text-tertiary hover:text-danger text-[10px] transition-all"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
          {prefs.length === 0 && (
            <div className="text-xs text-text-tertiary text-center py-6">No preferences</div>
          )}
        </div>
      </div>

      {/* Right: detail / add form */}
      <div className="flex-1 flex flex-col min-w-0">
        {showAdd ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">New Preference</h2>
            <label className="block">
              <span className="text-xs text-text-tertiary mb-1 block">Scope</span>
              <select
                value={newScope}
                onChange={(e) => setNewScope(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded text-text-primary outline-none focus:border-accent/50"
              >
                <option value="">Global</option>
                {projects.map((p) => (
                  <option key={p.folder} value={p.projectPath}>
                    Project: {p.projectPath}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-text-tertiary mb-1 block">Title</span>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder='e.g., "Always use TypeScript strict mode"'
                className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded text-text-primary outline-none focus:border-accent/50"
              />
            </label>
            <label className="block">
              <span className="text-xs text-text-tertiary mb-1 block">Content</span>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
                placeholder="Detailed rule..."
                className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded text-text-primary outline-none focus:border-accent/50 resize-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-text-tertiary mb-1 block">Tags (comma-separated)</span>
                <input
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="git, testing"
                  className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border rounded text-text-primary outline-none focus:border-accent/50"
                />
              </label>
              <div>
                <span className="text-xs text-text-tertiary mb-1 block">Trigger</span>
                <div className="flex gap-3 mt-1">
                  <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <input type="radio" checked={newAlways} onChange={() => setNewAlways(true)} className="accent-accent" />
                    Always
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <input type="radio" checked={!newAlways} onChange={() => setNewAlways(false)} className="accent-accent" />
                    Keywords
                  </label>
                </div>
                {!newAlways && (
                  <input
                    value={newKeywords}
                    onChange={(e) => setNewKeywords(e.target.value)}
                    placeholder="commit, git"
                    className="w-full mt-1.5 px-3 py-1.5 text-xs bg-bg-secondary border border-border rounded text-text-primary outline-none focus:border-accent/50"
                  />
                )}
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={!newTitle.trim() || !newContent.trim() || saving}
              className="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-40"
            >
              {saving ? 'Adding...' : 'Add Preference'}
            </button>
          </div>
        ) : selected ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{selected.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  selected.scope === 'project' ? 'bg-warning-muted text-warning' : 'bg-accent-muted text-accent'
                }`}>{selected.scope ?? 'global'}</span>
                {selected.project && (
                  <span className="text-[10px] text-text-tertiary font-mono">{selected.project}</span>
                )}
                {selected.autoInject && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-success-muted text-success">auto-inject</span>
                )}
              </div>
            </div>

            <div className="bg-bg-secondary border border-border rounded-lg p-4">
              <div className="text-xs text-text-tertiary mb-1">Content</div>
              <div className="text-sm whitespace-pre-wrap">{selected.content}</div>
            </div>

            {selected.trigger && (
              <div className="bg-bg-secondary border border-border rounded-lg p-4">
                <div className="text-xs text-text-tertiary mb-1">Trigger</div>
                <div className="flex gap-2">
                  {selected.trigger.always && (
                    <span className="text-xs px-2 py-0.5 rounded bg-accent-muted text-accent">Always active</span>
                  )}
                  {selected.trigger.keywords?.map((k) => (
                    <span key={k} className="text-xs px-2 py-0.5 rounded bg-bg-tertiary text-text-secondary">{k}</span>
                  ))}
                  {selected.trigger.categories?.map((c) => (
                    <span key={c} className="text-xs px-2 py-0.5 rounded bg-warning-muted text-warning">{c}</span>
                  ))}
                </div>
              </div>
            )}

            {(selected.tags?.length ?? 0) > 0 && (
              <div className="flex gap-1.5">
                {selected.tags!.map((t) => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-tertiary">{t}</span>
                ))}
              </div>
            )}

            <div className="text-[10px] font-mono text-text-tertiary">{selected.id}</div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
            Select a preference to view details, or click "+ Add"
          </div>
        )}
      </div>
    </div>
  );
}
