# /omcx-docs

Quick documentation generation and updates — **delegates writing to MiniMax** for token efficiency.

## Instructions

Create or update documentation for code, APIs, or features.

**IMPORTANT**: Delegate documentation writing to the document-writer agent (MiniMax M2.5) instead of writing it yourself. MiniMax excels at prose and saves Opus tokens.

### Workflow

1. **Gather Context** — Read the code/feature to document
2. **Check Proxy** — Call `switch_status` to check proxy availability
3. **Delegate to Document-Writer** — Use proxy mode (preferred) or MCP fallback
4. **Verify** — Review accuracy of written content

### How to Delegate

**Preferred: Direct switch via proxy**
```
mcp__oh-my-claude-background__switch_model with:
- provider: "minimax"
- model: "MiniMax-M2.5"
```
Then write the documentation directly using Edit/Write tools.
When finished: `mcp__oh-my-claude-background__switch_revert`

**Requires proxy** — launch via `oh-my-claude cc`. If switch fails, inform the user: "Proxy required. Launch via `oh-my-claude cc`."

**Include in the prompt:**
- What to document (file paths, feature names, API signatures)
- Target audience (developers, users, contributors)
- Output format (README section, JSDoc, API docs, inline comments)
- Current content if updating (so writer can match style)
- Specific conventions to follow

### Documentation Types

| Type | Delegation Prompt Pattern |
|------|--------------------------|
| **README** | "Write/update README section for [feature]. Current README: [content]. Match existing style." |
| **Changelog** | "Write changelog entries for: [changes]. Format: **Bold Title**: Description. Current changelog: [content]." |
| **API Docs** | "Write JSDoc/TSDoc for these functions: [signatures]. Include @param, @returns, @example." |
| **Usage Guide** | "Write usage examples for [feature]. Include code snippets for common scenarios." |

### Example: README Update

```
agent: "document-writer"
prompt: |
  Update the README.md for oh-my-claude with the following new feature:

  ## Feature: Navigator Agent
  - Kimi K2.5 multimodal specialist
  - Visual-to-code, document processing
  - Slash command: /omc-navigator

  ## Current README Command Table
  | `/omc-hephaestus` | Activate Hephaestus - code forge specialist |
  | `/omc-switch` | Switch model to external provider |

  ## Current Agent Table
  | **Hephaestus** | OpenAI | gpt-5.3-codex | Code forge specialist |
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

### After Document-Writer Returns

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
