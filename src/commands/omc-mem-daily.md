# /omc-mem-daily

Consolidate sessions into daily narrative summaries. By default, processes ALL sessions across all time, grouping them by day.

## Instructions

The user wants to organize their session memories into daily narratives. This command collects ALL sessions (type="session"), groups them by day, and for days with multiple sessions, generates a chronological narrative summary.

## Arguments

- `[date]` - Optional: specific date to process. Can be "today", "yesterday", or "YYYY-MM-DD". Default: process ALL sessions.
- `[scope]` - Optional: "project", "global", or "all" (default: all)

## Workflow

**Step 1: Get memory status**

```
Use mcp__oh-my-claude-background__memory_status to show current session statistics
```

Display:
```
Daily Narrative Analysis
========================
Total Sessions: X (Y project, Z global)
Mode: <all time | specific date>
```

**Step 2: Collect and group sessions**

Parse the arguments:
- If first argument is a date ("today", "yesterday", "YYYY-MM-DD"), set `specificDate`
- If an argument is "project", "global", or "all", use it as `scope`

```
Use mcp__oh-my-claude-background__recall with:
- type: "session"
- scope: <from arguments, default "all">
- limit: 1000 (get all sessions)
```

Group sessions by `createdAt` date (YYYY-MM-DD). If `specificDate` is provided, filter to only that date.

**Step 3: Analyze groups and ask for selection**

Display the grouping:
```
Session Groups Found
====================
- 2026-02-17: 3 sessions
- 2026-02-16: 5 sessions
- 2026-02-15: 1 session (skip - single session)
- 2026-02-14: 2 sessions
...

Days to consolidate: N
Days to skip (single session): M
```

Use `AskUserQuestion` to let the user choose which days to process. Present options:
- "All days with 2+ sessions (Recommended)" - Generate narratives for days with multiple sessions
- "All days (including singles)" - Generate narratives for ALL days including single-session days
- "None — cancel" - Abort without changes

If there are specific day groups to choose from, list them as a summary before the question so the user knows what will be processed.

**Step 4: Generate daily narratives**

For each day to process, use AI to create a chronological narrative:

```
Use mcp__oh-my-claude-background__summarize_memories with:
- mode: "analyze"
- type: "session"
- narrative: true
- dateRange: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
- scope: <scope>
```

The narrative format should be chronological:
```markdown
## Daily Narrative: YYYY-MM-DD

### Session Flow
- First we worked on X, discovered Y
- Then we pivoted to Z, fixed issue W
- Finally completed Q

### Key Accomplishments
- Bullet list of achievements

### Decisions Made
- Architectural/design decisions with rationale

### Patterns & Gotchas
- Reusable knowledge discovered
```

**Step 5: Save narratives and cleanup**

For each generated narrative:
```
Use mcp__oh-my-claude-background__summarize_memories with:
- mode: "execute"
- summary: <narrative content>
- title: "Daily Narrative: YYYY-MM-DD"
- tags: <keywords from the day's sessions>
- archiveOriginals: true (delete the original session files)
- originalIds: <list of session IDs from that day>
- targetScope: project (prefer project scope)
```

**Step 6: Show results**

```
Daily Narrative Results
=======================
Processed: X sessions across N days

Created:
- 2026-02-17: "Daily Narrative: 2026-02-17" (merged 3 sessions)
  Tags: bridge opencode polling sidebar
- 2026-02-16: "Daily Narrative: 2026-02-16" (merged 5 sessions)
  Tags: cc-to-cc daemon proxy
...

Skipped:
- 2026-02-15: 1 session (single session, no merge needed)

Timeline updated with new narratives.
```

## Error Handling

**If no sessions found:**
Display message and suggest running `/omc-mem-daily` after some sessions have been created.

**If no days with 2+ sessions:**
Suggest that single sessions don't need consolidation, or use "proceed all" to convert singles to narrative format.

**If AI provider unavailable:**
Display message that narrative generation requires a configured provider.

## Examples

```
User: /omc-mem-daily
-> Processes ALL sessions, groups by day, generates narratives for days with 2+ sessions

User: /omc-mem-daily today
-> Only processes today's sessions

User: /omc-mem-daily yesterday project
-> Only processes yesterday's project sessions

User: /omc-mem-daily 2026-02-15
-> Only processes sessions from specific date
```

## Key Differences from /omc-mem-summary

| Aspect | /omc-mem-daily | /omc-mem-summary |
|--------|----------------|------------------|
| Scope | Sessions only | Notes + Sessions |
| Time range | Single day (process all days) | Multi-day range (7/14/30 days) |
| Output | Daily narrative | Timeline summary |
| Purpose | Daily organization | Period compression |

ARGUMENTS: $ARGUMENTS
