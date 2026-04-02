# /omcx-docs

Quick documentation generation and updates.

## Instructions

Create or update documentation for code, APIs, or features.

**IMPORTANT**: If proxy routing is available, prefer `switch_model(minimax, MiniMax-M2.7)` for long-form docs. Otherwise write it directly.

### Workflow

1. **Identify What Changed** — Brief summary (1-2 lines per change)
2. **Choose Writer** — Use the routing below
3. **Verify** — Review accuracy of written content

### How to Route (2-Tier Cascade)

**Follow in priority order:**

1. **Proxy mode** (preferred for long-form prose): `switch_model(minimax, MiniMax-M2.7)` and write directly
2. **No proxy**: Write it yourself

**Key principle**: Tell the worker WHAT to document (file paths, feature names). Let the worker READ files itself.

Keep the task goal-oriented. If you route via proxy, still let the target model read files itself.

Example prompt:
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

### After Writing

1. Review the content for accuracy
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
