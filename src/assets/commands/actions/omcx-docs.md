# /omcx-docs

Quick documentation generation and updates — **delegates writing to MiniMax** for token efficiency.

## Instructions

Create or update documentation for code, APIs, or features.

**IMPORTANT**: Delegate documentation writing to bridge docs workers first (`bridge_send(role=docs, task)` or `bridge_send(cc:mm, task)`) instead of writing it yourself. MiniMax excels at prose and saves Opus tokens.

### Workflow

1. **Identify What Changed** — Brief summary (1-2 lines per change)
2. **Delegate to Worker** — Use 3-tier cascade below
3. **Verify** — Review accuracy of written content

### How to Delegate (2-Tier Cascade)

**Follow in priority order:**

1. **Bridge mode** (preferred): `bridge_send(cc:mm, task)` — worker reads files autonomously
2. **No bridge**: Write it yourself (last resort)

**Key principle**: Tell the worker WHAT to document (file paths, feature names). Let the worker READ files itself.

**NEVER pre-read files to pass content to the worker.**
Workers have full Read/Grep/Glob access and discover autonomously.

Example prompt (for bridge_send):
"Document the new Navigator agent. Read src/agents/navigator.ts and
existing README.md for conventions. Add to command table and agent table."

### Documentation Types

| Type | Delegation Prompt Pattern |
|------|--------------------------|
| **README** | "Write/update README section for [feature]. Current README: [content]. Match existing style." |
| **Changelog** | "Write changelog entries for: [changes]. Format: **Bold Title**: Description. Current changelog: [content]." |
| **API Docs** | "Write JSDoc/TSDoc for these functions: [signatures]. Include @param, @returns, @example." |
| **Usage Guide** | "Write usage examples for [feature]. Include code snippets for common scenarios." |

### Example: README Update

```text
tool: bridge_send
role: docs
task: |
  Update the README.md for oh-my-claude with the following new feature:

  ## Feature: Navigator Agent
  - Kimi K2.5 multimodal specialist
  - Visual-to-code, document processing
  - Slash command: /omc-navigator

  ## Current README Command Table
  | `/omc-hephaestus` | Activate Hephaestus - code forge specialist |
  | `mcp__oh-my-claude__switch_model` | Switch model to external provider via MCP |

  ## Current Agent Table
  | **Hephaestus** | Kimi | K2.5 | Code forge specialist |
  | **Navigator** | Kimi | K2.5 | Visual-to-code & multi-step tasks |

  Add /omc-navigator to command table after /omc-hephaestus.
  Return the exact lines to insert.
```

### For Bilingual Updates (EN + zh-CN)

When updating both READMEs, include both in a single prompt:

```
prompt: |
  Update both English and Chinese READMEs for [feature].

  ## English README section to update
  [content]

  ## Chinese README section to update
  [content]

  Return clearly labeled sections:
  ### English README Updates
  [content]

  ### Chinese README Updates
  [content]
```

### When NOT to Delegate

For trivial changes (fixing a typo, adding one line), just do it directly. Delegation overhead isn't worth it for < 3 lines of text.

### After the Docs Worker Returns

1. Review the content for accuracy (MiniMax writes well but may not know exact code details)
2. Apply using Edit tool
3. Verify formatting matches existing style

### Arguments

`/omcx-docs <target> [type]`

Examples:
- `/omcx-docs src/utils/auth.ts` - Add JSDoc to file
- `/omcx-docs README` - Update project README
- `/omcx-docs changelog` - Update changelog for recent changes
- `/omcx-docs api` - Generate API documentation
- `/omcx-docs src/components/Button.tsx usage` - Add usage examples
