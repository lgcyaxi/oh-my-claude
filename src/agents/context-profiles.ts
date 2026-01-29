/**
 * Agent Context Profiles
 *
 * Per-agent context preferences and token budgets.
 */

import type { ContextProfile } from "../context/types";

export const AGENT_CONTEXT_PROFILES: Record<string, ContextProfile> = {
  oracle: {
    agentName: "oracle",
    defaultContexts: ["project-structure", "config-files", "readme"],
    maxTokens: 4000,
    priorities: [
      "project-structure",
      "config-files",
      "package-info",
      "readme",
      "related-files",
    ],
  },

  analyst: {
    agentName: "analyst",
    defaultContexts: ["related-files", "git-status"],
    maxTokens: 2000,
    priorities: ["related-files", "git-status", "recent-changes", "test-patterns"],
  },

  librarian: {
    agentName: "librarian",
    defaultContexts: ["package-info", "readme"],
    maxTokens: 1500,
    priorities: ["package-info", "readme", "config-files"],
  },

  "frontend-ui-ux": {
    agentName: "frontend-ui-ux",
    defaultContexts: ["project-structure", "config-files", "related-files"],
    maxTokens: 3000,
    priorities: [
      "project-structure",
      "related-files",
      "config-files",
      "package-info",
    ],
  },

  "document-writer": {
    agentName: "document-writer",
    defaultContexts: ["readme", "project-structure", "package-info"],
    maxTokens: 3000,
    priorities: ["readme", "project-structure", "package-info", "config-files"],
  },

  explore: {
    agentName: "explore",
    defaultContexts: ["project-structure", "config-files"],
    maxTokens: 2000,
    priorities: ["project-structure", "config-files", "package-info"],
  },
};

export function getAgentProfile(agentName: string): ContextProfile {
  return (
    AGENT_CONTEXT_PROFILES[agentName.toLowerCase()] ?? {
      agentName,
      defaultContexts: ["project-structure"],
      maxTokens: 2000,
      priorities: ["project-structure", "package-info", "readme"],
    }
  );
}
