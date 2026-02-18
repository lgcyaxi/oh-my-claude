# /omcx-commit

Smart git commit with conventional commit messages.

## Instructions

Create a well-crafted git commit for the current changes.

### Workflow

1. **Check Status**
   ```bash
   git status --short
   git diff --stat
   ```

2. **Stage Changes** (if nothing staged)
   ```bash
   git add -u  # Stage modified files
   # Or: git add -A  # Stage all including untracked
   ```

3. **Analyze Changes**
   - What files were modified?
   - What's the nature of changes? (feat/fix/refactor/docs/test/chore)
   - What component/scope is affected?

4. **Check Recent Commits** (for style consistency)
   ```bash
   git log --oneline -5
   ```

5. **Create Commit**
   Use conventional commit format:
   ```
   <type>(<scope>): <subject>

   <body - optional, explains WHY>
   ```

### Documentation Updates (Delegate to MiniMax!)

**IMPORTANT**: When the user asks to update changelogs, READMEs, or other documentation as part of the commit, **delegate the writing to document-writer (MiniMax)** instead of writing it yourself. This saves significant tokens.

**How to delegate doc writing:**

**Preferred: Direct switch via proxy**
```
mcp__oh-my-claude-background__switch_model with:
- provider: "minimax"
- model: "MiniMax-M2.5"
```
Then write the documentation directly using Edit/Write tools.
When finished: `mcp__oh-my-claude-background__switch_revert`

**Requires proxy** — launch via `oh-my-claude cc`. If switch fails, inform the user: "Proxy required. Launch via `oh-my-claude cc`."

**What to include in the document-writer prompt:**
- The git diff summary (what files changed, lines added/removed)
- Current content of files to update (changelog, README sections)
- Project documentation conventions (from CLAUDE.md)
- The version number to use
- Specific sections to add/update
- Whether to update both EN and zh-CN READMEs

### Commit Types

| Type | Use For |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring (no behavior change) |
| `docs` | Documentation only |
| `test` | Adding/updating tests |
| `chore` | Build, deps, config changes |
| `style` | Formatting, whitespace |

### Rules

- **Subject**: Present tense, imperative ("add" not "added")
- **Length**: Subject line < 72 characters
- **No period** at end of subject line
- **Body**: Explain WHY, not WHAT (the diff shows what)

### Examples

```bash
# Simple
git commit -m "fix(auth): resolve token expiration bug"

# With body
git commit -m "feat(api): add rate limiting to endpoints

Prevents abuse and ensures fair usage across clients.
Configurable via RATE_LIMIT_PER_MINUTE env var."
```

### Pre-Commit Checks

Before committing, verify:
- [ ] Build passes (if applicable)
- [ ] No obvious errors in changed files
- [ ] Not committing sensitive data (.env, credentials)

### Arguments

`/omcx-commit [message]`

- If message provided: Use it directly (still format properly)
- If no message: Analyze changes and generate appropriate message
