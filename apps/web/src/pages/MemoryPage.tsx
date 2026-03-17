import { useEffect, useState } from 'react';
import {
  getMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  type MemoryEntry,
} from '../lib/api';

type MemType = 'all' | 'note' | 'session';

interface ProjectGroup {
  name: string;
  projectPath?: string;
  notes: MemoryEntry[];
  sessions: MemoryEntry[];
}

export default function MemoryPage() {
  const [omcGroups, setOmcGroups] = useState<ProjectGroup[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [memType, setMemType] = useState<MemType>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFull, setSelectedFull] = useState<MemoryEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const data = await getMemories();

      // Group omc project entries by project
      const groups = new Map<string, ProjectGroup>();
      for (const e of data.omcProject ?? []) {
        const proj = (e as MemoryEntry & { project?: string }).project ?? 'unknown';
        if (!groups.has(proj)) {
          groups.set(proj, {
            name: proj,
            projectPath: (e as MemoryEntry & { projectPath?: string }).projectPath,
            notes: [],
            sessions: [],
          });
        }
        const g = groups.get(proj)!;
        if (e.type === 'session' || e.id.includes('/sessions/')) {
          g.sessions.push(e);
        } else {
          g.notes.push(e);
        }
      }

      // Add global as a special "group"
      const sorted = Array.from(groups.values()).sort(
        (a, b) => (b.notes.length + b.sessions.length) - (a.notes.length + a.sessions.length),
      );
      setOmcGroups(sorted);
      if (sorted.length > 0 && !selectedProject) {
        setSelectedProject(sorted[0]!.name);
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  // Current entries (OMC project-scoped only — global/auto are in the Memory tab)
  let currentEntries: MemoryEntry[] = [];
  {
    const group = omcGroups.find((g) => g.name === selectedProject);
    if (group) {
      if (memType === 'note') currentEntries = group.notes;
      else if (memType === 'session') currentEntries = group.sessions;
      else currentEntries = [...group.notes, ...group.sessions];
    }
  }

  const filtered = currentEntries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const selectedStub = currentEntries.find((e) => e.id === selectedId);
  const selected = selectedFull?.id === selectedId ? selectedFull : selectedStub;

  useEffect(() => {
    if (!selectedStub) { setSelectedFull(null); return; }
    getMemory(selectedStub.scope, selectedStub.id)
      .then((full) => setSelectedFull(full as MemoryEntry))
      .catch(() => setSelectedFull(null));
  }, [selectedId]);

  function startEdit(entry: MemoryEntry) {
    setEditContent(entry.raw);
    setEditing(true);
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      await updateMemory(selected.scope, selected.id, editContent);
      setEditing(false);
      refresh();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(entry: MemoryEntry) {
    try {
      await deleteMemory(entry.scope, entry.id);
      setConfirmDelete(null);
      if (selectedId === entry.id) { setSelectedId(null); setSelectedFull(null); }
      refresh();
    } catch { /* ignore */ }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-text-tertiary">Loading memories...</div>;
  }

  const currentGroup = omcGroups.find((g) => g.name === selectedProject);
  const noteCount = currentGroup?.notes.length ?? 0;
  const sessionCount = currentGroup?.sessions.length ?? 0;

  return (
    <div className="flex gap-4 h-[calc(100vh-3rem)]">
      {/* Left: Project sidebar */}
      <div className="w-56 shrink-0 flex flex-col bg-bg-secondary border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border">
          <span className="text-xs text-text-tertiary uppercase tracking-wider">
            Projects
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {omcGroups.map((g) => (
            <button
              key={g.name}
              onClick={() => { setSelectedProject(g.name); setSelectedId(null); setSelectedFull(null); }}
              className={`w-full text-left px-3 py-2 text-sm border-b border-border/50 transition-colors ${
                selectedProject === g.name
                  ? 'bg-accent-muted text-accent-hover font-medium'
                  : 'text-text-secondary hover:bg-bg-hover'
              }`}
            >
              <div className="truncate font-medium text-[13px]">{g.name}</div>
              <div className="text-[10px] text-text-tertiary mt-0.5">
                {g.notes.length} note{g.notes.length !== 1 ? 's' : ''}
                {' · '}{g.sessions.length} session{g.sessions.length !== 1 ? 's' : ''}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Middle: entry list */}
      <div className="w-64 shrink-0 flex flex-col bg-bg-secondary border border-border rounded-lg overflow-hidden">
        {/* Type filter (only for project groups, not global) */}
        {selectedProject !== '__global__' && (
          <div className="flex border-b border-border">
            {([['all', `All (${noteCount + sessionCount})`], ['note', `Notes (${noteCount})`], ['session', `Sessions (${sessionCount})`]] as [MemType, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setMemType(t)}
                className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-colors ${
                  memType === t ? 'text-accent border-b-2 border-accent' : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="p-2">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded border border-border bg-bg-tertiary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className={`group border-b border-border/50 ${
                selectedId === entry.id ? 'bg-accent-muted' : 'hover:bg-bg-hover'
              }`}
            >
              {confirmDelete === entry.id ? (
                <div className="px-3 py-2">
                  <div className="text-[11px] text-danger mb-1">Delete?</div>
                  <div className="flex gap-1.5">
                    <button onClick={() => handleDelete(entry)} className="px-2 py-0.5 text-[10px] bg-danger text-white rounded">Delete</button>
                    <button onClick={() => setConfirmDelete(null)} className="px-2 py-0.5 text-[10px] border border-border text-text-secondary rounded">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center">
                  <button
                    onClick={() => { setSelectedId(entry.id); setEditing(false); }}
                    className={`flex-1 text-left px-3 py-2 min-w-0 ${
                      selectedId === entry.id ? 'text-accent-hover' : 'text-text-secondary'
                    }`}
                  >
                    <div className="text-[12px] font-medium truncate">{entry.title}</div>
                    <div className="flex gap-1 mt-0.5">
                      <span className={`text-[9px] px-1 rounded ${
                        entry.type === 'session' ? 'bg-warning-muted text-warning' : 'bg-accent-muted text-accent'
                      }`}>{entry.type}</span>
                      {entry.created && <span className="text-[9px] text-text-tertiary">{entry.created.slice(0, 10)}</span>}
                    </div>
                    {entry.tags.length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {entry.tags.slice(0, 3).map((t) => (
                          <span key={t} className="text-[9px] px-1 rounded bg-bg-tertiary text-text-tertiary">{t}</span>
                        ))}
                      </div>
                    )}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(entry.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 mr-1 text-text-tertiary hover:text-danger text-[10px] transition-all"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-xs text-text-tertiary text-center py-6">
              {search ? 'No matches' : 'No memories'}
            </div>
          )}
        </div>
      </div>

      {/* Right: viewer/editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate">{selected.title}</h2>
                <div className="flex items-center gap-2 text-xs text-text-tertiary mt-0.5">
                  <span className={`px-1.5 py-0.5 rounded ${
                    selected.type === 'session' ? 'bg-warning-muted text-warning' : 'bg-accent-muted text-accent'
                  }`}>{selected.type}</span>
                  {selected.created && <span>{selected.created.slice(0, 10)}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {editing ? (
                  <>
                    <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs border border-border text-text-secondary rounded hover:bg-bg-hover">Cancel</button>
                  </>
                ) : (
                  <button onClick={() => startEdit(selected)} className="px-3 py-1.5 text-xs border border-border text-text-secondary rounded hover:bg-bg-hover hover:text-text-primary">Edit</button>
                )}
              </div>
            </div>
            {editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 p-4 text-sm font-mono bg-bg-secondary border border-border rounded-lg text-text-primary resize-none outline-none focus:border-accent/50 leading-relaxed"
              />
            ) : (
              <div className="flex-1 overflow-y-auto bg-bg-secondary border border-border rounded-lg p-4">
                <pre className="text-sm font-mono whitespace-pre-wrap break-words text-text-primary leading-relaxed">{selected.content}</pre>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
            Select a memory to view or edit
          </div>
        )}
      </div>
    </div>
  );
}
