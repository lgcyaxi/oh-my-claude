import { useState } from "react";
import type { SessionInfo } from "../lib/api";
import { StatusBadge } from "./StatusBadge";
import { ModelPicker } from "./ModelPicker";

interface SessionListProps {
  sessions: SessionInfo[];
  onSwitch: (controlPort: number, sessionId: string, provider: string, model: string) => void;
  onRevert: (controlPort: number, sessionId: string) => void;
  switching: boolean;
}

export function SessionList({ sessions, onSwitch, onRevert, switching }: SessionListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <div className="text-3xl mb-3">~</div>
        <div className="text-sm">No sessions running</div>
        <div className="text-xs mt-1 text-gray-600">
          Start with: oh-my-claude cc
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {sessions.map((session) => {
        const isExpanded = expandedId === session.sessionId;
        return (
          <div
            key={session.sessionId}
            className="rounded-lg bg-white/[0.03] border border-white/[0.06]"
          >
            {/* Session header — click to expand */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : session.sessionId)}
              className="w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-white/[0.03] transition-colors rounded-lg"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-100 truncate">
                  {session.projectName}
                </div>
                <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                  {session.sessionId.slice(0, 8)} &middot; port {session.port}
                </div>
              </div>
              <StatusBadge
                switched={session.switched}
                provider={session.provider}
                model={session.model}
                healthy={session.healthy}
              />
            </button>

            {/* Expanded: model picker */}
            {isExpanded && (
              <div className="px-3 pb-3 pt-1 border-t border-white/[0.04]">
                <ModelPicker
                  currentProvider={session.provider}
                  currentModel={session.model}
                  switched={session.switched}
                  disabled={switching || !session.healthy}
                  onSwitch={(provider, model) =>
                    onSwitch(session.controlPort, session.sessionId, provider, model)
                  }
                  onRevert={() => onRevert(session.controlPort, session.sessionId)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
