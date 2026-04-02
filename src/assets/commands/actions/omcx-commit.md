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

### Documentation Updates

**Routing priority** (follow in order):
1. **Proxy mode**: `switch_model(minimax, MiniMax-M2.7)` for changelog/README prose
2. **No proxy**: Write it yourself

**Key principle**: Tell the worker WHAT changed (1-2 lines). Let the worker READ files itself.

Example prompt:
"Update changelog for: [1-line per change]. Read docs/changelog/v2.1.x.md,
README.md, and CLAUDE.md for conventions. Follow existing format."

**NEVER pre-read files to pass content to the worker.**
Workers have full Read/Grep/Glob access and discover autonomously.

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
