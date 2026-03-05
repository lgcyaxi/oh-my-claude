# /omcx-implement

Quick implementation for small, focused tasks.

## Instructions

Implement a small feature or change directly without full planning workflow.

**Use this for:**
- Single-file changes
- Small features (< 100 lines)
- Clear, well-defined tasks
- Quick fixes that aren't bugs

**Don't use this for:**
- Multi-file refactoring → use `/omc-plan`
- Complex features → use `/omc-plan`
- Unclear requirements → use `/omc-plan`

### Workflow

1. **Understand the Task**
   - What exactly needs to be implemented?
   - Where does it go? (file, location)
   - Are there existing patterns to follow?

2. **Quick Context Gather** (model selection is handled by Claude Code)
   ```
   Task(subagent_type="Explore", prompt="Find similar implementations for [feature]")
   ```

3. **Implement**
   - Follow existing code patterns
   - Keep it minimal - don't over-engineer
   - Add only what's needed

4. **Verify**
   - Run typecheck/lint if available
   - Run tests if affected
   - Quick manual verification

### Implementation Principles

| Principle | Description |
|-----------|-------------|
| **Minimal** | Add only what's requested |
| **Consistent** | Match existing patterns |
| **Complete** | Include error handling if needed |
| **Tested** | Add basic test if pattern exists |

### Anti-Patterns (Don't Do)

- Adding unnecessary abstractions
- Creating "helper" utilities for one-time use
- Over-commenting obvious code
- Adding features not requested
- Refactoring surrounding code

### Output

After implementation:
1. Show what was added/changed
2. Run verification (typecheck/tests)
3. Report any issues found

### Arguments

`/omcx-implement <description>`

Examples:
- `/omcx-implement add loading spinner to submit button`
- `/omcx-implement add validation for email field`
- `/omcx-implement create getUserById function in user-service.ts`
