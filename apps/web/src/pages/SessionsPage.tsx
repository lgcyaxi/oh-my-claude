import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getProjects,
  getProjectSessions,
  renameSession,
  deleteSession,
  cleanupEmptySessions,
  deleteProject,
  type ProjectEntry,
  type SessionEntry,
} from '../lib/api';

export default function SessionsPage() {
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [projectPath, setProjectPath] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<string | null>(null);

  // Load projects
  useEffect(() => {
    let active = true;
    getProjects()
      .then((data) => {
        if (!active) return;
        setProjects(data.projects);
        // Auto-select first project
        if (data.projects.length > 0 && !selectedFolder) {
          setSelectedFolder(data.projects[0]!.folder);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  // Load sessions when project changes
  function reloadSessions() {
    if (!selectedFolder) return;
    getProjectSessions(selectedFolder)
      .then((data) => {
        setSessions(data.sessions);
        setProjectPath(data.projectPath);
      })
      .catch(() => setSessions([]));
  }

  useEffect(() => {
    if (!selectedFolder) return;
    let active = true;
    setSessions([]);

    getProjectSessions(selectedFolder)
      .then((data) => {
        if (!active) return;
        setSessions(data.sessions);
        setProjectPath(data.projectPath);
      })
      .catch(() => {
        if (!active) return;
        setSessions([]);
      });
    return () => { active = false; };
  }, [selectedFolder]);

  async function handleRename(sessionId: string) {
    if (!selectedFolder || !editValue.trim()) return;
    try {
      await renameSession(selectedFolder, sessionId, editValue.trim());
      setEditingId(null);
      reloadSessions();
    } catch { /* ignore */ }
  }

  async function handleDelete(sessionId: string) {
    if (!selectedFolder) return;
    try {
      await deleteSession(selectedFolder, sessionId);
      setConfirmDelete(null);
      reloadSessions();
    } catch { /* ignore */ }
  }

  async function handleDeleteProject(folder: string) {
    try {
      await deleteProject(folder);
      setConfirmDeleteProject(null);
      if (selectedFolder === folder) {
        setSelectedFolder(null);
        setSessions([]);
      }
      // Reload projects
      getProjects().then((data) => setProjects(data.projects));
    } catch { /* ignore */ }
  }

  const emptyCount = sessions.filter((s) => !s.firstPrompt && !s.summary).length;

  async function handleCleanup() {
    if (!selectedFolder) return;
    try {
      const result = await cleanupEmptySessions(selectedFolder);
      if (result.deleted > 0) reloadSessions();
    } catch { /* ignore */ }
  }

  const filtered = sessions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.summary?.toLowerCase().includes(q) ||
      s.firstPrompt?.toLowerCase().includes(q) ||
      s.gitBranch?.toLowerCase().includes(q)
    );
  });

  function formatDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays === 1) return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function shortenPath(p: string): string {
    // Show last 2 segments of path
    const parts = p.replace(/\\/g, '/').split('/');
    return parts.slice(-2).join('/');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-tertiary">
        Loading sessions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-xl font-semibold mb-4">Sessions</h1>
        <div className="px-4 py-3 rounded-lg bg-danger-muted border border-danger/20 text-danger text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-3rem)]">
      {/* Project Sidebar */}
      <div className="w-56 shrink-0 bg-bg-secondary border border-border rounded-lg overflow-hidden flex flex-col">
        <div className="px-3 py-2.5 border-b border-border">
          <span className="text-xs text-text-tertiary uppercase tracking-wider">
            Projects ({projects.length})
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {projects.map((p) => (
            <div
              key={p.folder}
              className={`group border-b border-border/50 ${
                selectedFolder === p.folder
                  ? 'bg-accent-muted'
                  : 'hover:bg-bg-hover'
              }`}
            >
              {confirmDeleteProject === p.folder ? (
                <div className="px-3 py-2">
                  <div className="text-[11px] text-danger mb-1.5">Delete this project?</div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleDeleteProject(p.folder)}
                      className="px-2 py-0.5 text-[10px] bg-danger text-white rounded"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDeleteProject(null)}
                      className="px-2 py-0.5 text-[10px] border border-border text-text-secondary rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center">
                  <button
                    onClick={() => setSelectedFolder(p.folder)}
                    className={`flex-1 text-left px-3 py-2 text-sm transition-colors ${
                      selectedFolder === p.folder
                        ? 'text-accent-hover font-medium'
                        : 'text-text-secondary'
                    }`}
                  >
                    <div className="truncate font-medium text-[13px]">
                      {shortenPath(p.projectPath)}
                    </div>
                    <div className="text-[10px] text-text-tertiary mt-0.5">
                      {p.sessionCount} session{p.sessionCount !== 1 ? 's' : ''}
                      {p.lastModified && ` · ${formatDate(p.lastModified)}`}
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteProject(p.folder);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 mr-1 text-text-tertiary hover:text-danger text-[10px] transition-all"
                    title="Remove project"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
          {projects.length === 0 && (
            <div className="px-3 py-4 text-xs text-text-tertiary text-center">
              No projects found
            </div>
          )}
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-xl font-semibold">Sessions</h1>
          {projectPath && (
            <span className="text-xs text-text-tertiary font-mono truncate">
              {projectPath}
            </span>
          )}
        </div>

        {/* Search + Cleanup */}
        <div className="mb-3 flex gap-2">
          <input
            type="text"
            placeholder="Filter sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
          />
          {emptyCount > 0 && (
            <button
              onClick={handleCleanup}
              className="shrink-0 px-3 py-1.5 text-xs border border-border text-text-tertiary rounded hover:text-danger hover:border-danger/50 transition-colors"
              title={`Delete ${emptyCount} empty stub session${emptyCount !== 1 ? 's' : ''}`}
            >
              Clean {emptyCount} empty
            </button>
          )}
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {filtered.map((s) => (
            <div
              key={s.sessionId}
              className="group px-4 py-3 rounded-lg border border-border bg-bg-secondary hover:border-border-strong transition-colors"
            >
              {/* Delete confirmation */}
              {confirmDelete === s.sessionId ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-danger">Delete this session permanently?</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(s.sessionId)}
                      className="px-3 py-1 text-xs bg-danger text-white rounded hover:bg-danger/80"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-3 py-1 text-xs border border-border text-text-secondary rounded hover:bg-bg-hover"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to={`/sessions/${encodeURIComponent(selectedFolder!)}/${s.sessionId}`}
                      className="min-w-0 flex-1"
                    >
                      {/* Inline rename */}
                      {editingId === s.sessionId ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleRename(s.sessionId); }
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          onBlur={() => handleRename(s.sessionId)}
                          onClick={(e) => e.preventDefault()}
                          className="w-full text-sm font-medium bg-bg-tertiary border border-accent rounded px-1.5 py-0.5 outline-none text-text-primary"
                        />
                      ) : (
                        <div className="text-sm font-medium truncate">
                          {s.summary || s.firstPrompt || 'Untitled session'}
                        </div>
                      )}
                      {editingId !== s.sessionId && s.summary && s.firstPrompt && s.firstPrompt !== 'No prompt' && (
                        <div className="text-xs text-text-tertiary mt-0.5 truncate">
                          {s.firstPrompt.slice(0, 120)}
                        </div>
                      )}
                    </Link>
                    <div className="shrink-0 flex items-start gap-2">
                      <div className="text-right">
                        <div className="text-[11px] text-text-tertiary">
                          {formatDate(s.modified)}
                        </div>
                        {s.messageCount > 0 && (
                          <div className="text-[10px] text-text-tertiary mt-0.5">
                            {s.messageCount} msg{s.messageCount !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                      {/* Action buttons */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setEditingId(s.sessionId);
                            setEditValue(s.summary || s.firstPrompt || '');
                          }}
                          title="Rename"
                          className="p-1 text-text-tertiary hover:text-text-primary text-[10px]"
                        >
                          ✏
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setConfirmDelete(s.sessionId);
                          }}
                          title="Delete"
                          className="p-1 text-text-tertiary hover:text-danger text-[10px]"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                  {s.gitBranch && (
                    <span className="inline-block mt-1.5 px-1.5 py-0.5 text-[10px] rounded bg-accent-muted text-accent font-mono">
                      {s.gitBranch}
                    </span>
                  )}
                </>
              )}
            </div>
          ))}

          {filtered.length === 0 && sessions.length > 0 && (
            <div className="text-sm text-text-tertiary text-center py-8">
              No sessions match "{search}"
            </div>
          )}

          {sessions.length === 0 && selectedFolder && (
            <div className="text-sm text-text-tertiary text-center py-8">
              No sessions found for this project
            </div>
          )}

          {!selectedFolder && (
            <div className="text-sm text-text-tertiary text-center py-8">
              Select a project to view sessions
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
