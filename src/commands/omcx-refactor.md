# /omcx-refactor

Quick refactoring for focused code improvements.

## Instructions

Refactor code while preserving behavior. This is for focused, single-concern refactoring.

**Use this for:**
- Renaming (variables, functions, files)
- Extracting functions/methods
- Simplifying complex conditionals
- Removing duplication (DRY)
- Improving readability

**Don't use this for:**
- Changing behavior → that's a feature/fix
- Large-scale restructuring → use `/omc-plan`
- Architecture changes → use `/omc-plan`

### Workflow

1. **Understand Current Code**
   - Read the code to refactor
   - Identify what needs improvement
   - Understand dependencies

2. **Plan Refactoring**
   - What specific change?
   - What files affected?
   - Any risks?

3. **Refactor**
   - Make focused changes
   - One concern at a time
   - Keep commits atomic

4. **Verify Behavior Unchanged**
   - Run tests
   - Check types
   - Quick smoke test

### Refactoring Types

| Type | Description | Example |
|------|-------------|---------|
| **Rename** | Better naming | `getData` → `fetchUserProfile` |
| **Extract** | Pull out logic | Extract validation to function |
| **Inline** | Remove indirection | Inline single-use variable |
| **Simplify** | Reduce complexity | Flatten nested conditionals |
| **DRY** | Remove duplication | Extract shared logic |

### Safety Checklist

Before refactoring:
- [ ] Tests exist for the code (or add them first)
- [ ] Understand all usages (grep/find references)
- [ ] No behavior changes intended

After refactoring:
- [ ] All tests pass
- [ ] Types check
- [ ] Behavior unchanged

### Principles

1. **One thing at a time** - Don't mix refactorings
2. **Small steps** - Easier to verify, easier to revert
3. **Tests first** - If no tests, add them before refactoring
4. **Preserve behavior** - Refactoring ≠ changing functionality

### Arguments

`/omcx-refactor <description>`

Examples:
- `/omcx-refactor rename getUserData to fetchUserProfile`
- `/omcx-refactor extract email validation to separate function`
- `/omcx-refactor simplify the nested if-else in handleSubmit`
- `/omcx-refactor remove duplicate error handling in api calls`
