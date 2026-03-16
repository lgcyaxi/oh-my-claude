import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getConversation,
  type ConversationEntry,
  type ContentBlock,
  type SessionMeta,
} from '../lib/api';

export default function ConversationPage() {
  const { folder, id } = useParams<{ folder: string; id: string }>();
  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!folder || !id) return;
    let active = true;
    setLoading(true);

    getConversation(folder, id)
      .then((data) => {
        if (!active) return;
        setEntries(data.entries);
        setMeta(data.meta);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
        setLoading(false);
      });

    return () => { active = false; };
  }, [folder, id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollTop(el.scrollTop > 400);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-tertiary">
        Loading conversation...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl">
        <Link to={`/sessions`} className="text-xs text-accent hover:text-accent-hover mb-4 inline-block">
          ← Back to sessions
        </Link>
        <div className="px-4 py-3 rounded-lg bg-danger-muted border border-danger/20 text-danger text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto relative">
      {/* Header */}
      <div className="mb-4">
        <Link
          to={`/sessions`}
          className="text-xs text-accent hover:text-accent-hover mb-2 inline-block"
        >
          ← Back to sessions
        </Link>
        {meta && (
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <h1 className="text-lg font-semibold mb-1">
              {meta.summary || 'Conversation'}
            </h1>
            <div className="flex items-center gap-3 text-xs text-text-tertiary">
              <span>{meta.messageCount} messages</span>
              <span>·</span>
              <span>{new Date(meta.created).toLocaleDateString()}</span>
              {meta.gitBranch && (
                <>
                  <span>·</span>
                  <span className="font-mono px-1 py-0.5 rounded bg-accent-muted text-accent">
                    {meta.gitBranch}
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="space-y-3 pb-8">
        {entries.map((entry) => (
          <MessageBubble key={entry.uuid} entry={entry} />
        ))}
      </div>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center shadow-lg hover:bg-accent-hover transition-colors"
          title="Scroll to top"
        >
          ↑
        </button>
      )}
    </div>
  );
}

/* ── Message rendering ── */

function MessageBubble({ entry }: { entry: ConversationEntry }) {
  if (!entry.message) return null;

  const isUser = entry.type === 'user';
  const content = entry.message.content;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-accent text-white'
            : 'bg-bg-secondary border border-border'
        }`}
      >
        {/* Role label */}
        <div className={`text-[10px] mb-1.5 ${isUser ? 'text-white/60' : 'text-text-tertiary'}`}>
          {isUser ? 'You' : 'Assistant'}
          {entry.message.model && !isUser && (
            <span className="ml-1.5 font-mono">{entry.message.model}</span>
          )}
        </div>

        {/* Content */}
        {typeof content === 'string' ? (
          <div className="text-sm whitespace-pre-wrap break-words">{content}</div>
        ) : (
          <ContentBlocks blocks={content} isUser={isUser} />
        )}

        {/* Timestamp */}
        <div className={`text-[9px] mt-2 ${isUser ? 'text-white/40' : 'text-text-tertiary'}`}>
          {new Date(entry.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}

function ContentBlocks({ blocks, isUser }: { blocks: ContentBlock[]; isUser: boolean }) {
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <ContentBlockView key={i} block={block} isUser={isUser} />
      ))}
    </div>
  );
}

function ContentBlockView({ block, isUser }: { block: ContentBlock; isUser: boolean }) {
  const [expanded, setExpanded] = useState(false);

  switch (block.type) {
    case 'text':
      return (
        <div className="text-sm whitespace-pre-wrap break-words">
          {block.text}
        </div>
      );

    case 'thinking':
      if (!block.thinking) return null;
      return (
        <div className={`rounded border text-xs ${isUser ? 'border-white/20' : 'border-border'}`}>
          <button
            onClick={() => setExpanded(!expanded)}
            className={`w-full text-left px-2.5 py-1.5 flex items-center gap-1.5 ${
              isUser ? 'text-white/60 hover:text-white/80' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
            <span className="font-medium">Thinking</span>
            {!expanded && (
              <span className="truncate ml-1 opacity-60">
                {block.thinking.split('\n')[0]?.slice(0, 60)}...
              </span>
            )}
          </button>
          {expanded && (
            <div className={`px-2.5 py-2 border-t whitespace-pre-wrap break-words ${
              isUser ? 'border-white/20 text-white/70' : 'border-border text-text-secondary'
            }`}>
              {block.thinking}
            </div>
          )}
        </div>
      );

    case 'tool_use':
      return (
        <div className={`rounded border text-xs ${isUser ? 'border-white/20' : 'border-border'}`}>
          <button
            onClick={() => setExpanded(!expanded)}
            className={`w-full text-left px-2.5 py-1.5 flex items-center gap-1.5 ${
              isUser ? 'text-white/60 hover:text-white/80' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
            <span className="font-mono font-medium">{block.name || 'tool_use'}</span>
          </button>
          {expanded && (
            <div className={`px-2.5 py-2 border-t font-mono whitespace-pre-wrap break-words ${
              isUser ? 'border-white/20 text-white/70' : 'border-border text-text-secondary'
            }`}>
              {typeof block.input === 'string'
                ? block.input
                : JSON.stringify(block.input, null, 2)}
            </div>
          )}
        </div>
      );

    case 'tool_result':
      return (
        <div className={`rounded border text-xs ${isUser ? 'border-white/20' : 'border-border'}`}>
          <button
            onClick={() => setExpanded(!expanded)}
            className={`w-full text-left px-2.5 py-1.5 flex items-center gap-1.5 ${
              isUser ? 'text-white/60 hover:text-white/80' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
            <span className="font-medium">Tool Result</span>
            {block.tool_use_id && (
              <span className="font-mono opacity-50 text-[9px]">{block.tool_use_id.slice(0, 8)}</span>
            )}
          </button>
          {expanded && (
            <div className={`px-2.5 py-2 border-t whitespace-pre-wrap break-words ${
              isUser ? 'border-white/20 text-white/70' : 'border-border text-text-secondary'
            }`}>
              {typeof block.content === 'string'
                ? block.content
                : JSON.stringify(block.content, null, 2)}
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
}
