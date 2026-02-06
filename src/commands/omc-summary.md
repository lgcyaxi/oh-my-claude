# /omc-summary

Consolidate memories from a date range into a single timeline summary.

## Instructions

The user wants to create a consolidated summary of their memories over a time period. This command collects memories within a date range and uses AI to produce a timeline-style summary.

## Arguments

- `[days]` - Optional: number of days to look back (default: 7). Can also be "14", "30", etc.
- `[scope]` - Optional: "project", "global", or "all" (default: all)

## Workflow

**Step 1: Get memory status**

```
Use mcp__oh-my-claude-background__memory_status to show current memory statistics
```

Display a summary:
```
Memory Summary
==============
Total: X memories (Y project, Z global)
Looking back: N days
```

**Step 2: Analyze and generate summary**

Parse the arguments:
- If first argument is a number, use it as `days`
- If an argument is "project", "global", or "all", use it as `scope`

```
Use mcp__oh-my-claude-background__summarize_memories with:
- mode: "analyze"
- days: <from arguments, default 7>
- scope: <from arguments, default "all">
```

This uses AI (ZhiPu -> MiniMax -> DeepSeek) to create a consolidated timeline.

**Step 3: Display summary preview**

Format the results as:

```
Timeline Summary Preview
========================
Date Range: YYYY-MM-DD to YYYY-MM-DD
Memories Included: N
Provider: <which AI was used>

---

<AI-generated summary content in markdown>

---
```

**Step 4: Ask for confirmation**

Ask the user:
- "save" - Save the summary as a new memory
- "save and archive" - Save summary AND delete the original memories
- "edit" - Let user modify the summary before saving
- "cancel" - Discard without saving

**Step 5: Execute save**

If user confirms:

```
Use mcp__oh-my-claude-background__summarize_memories with:
- mode: "execute"
- summary: <the summary text>
- title: <the suggested title>
- archiveOriginals: <true if user chose "save and archive">
- originalIds: <list of memory IDs that were summarized>
- targetScope: <project or global, prefer project if available>
```

**Step 6: Show results**

Display results:
```
Summary Saved
=============
- New memory: <summary-id> "<Summary Title>"
- Archived: X original memories (if applicable)
- Location: <project or global scope>
```

## Error Handling

**If no AI provider available:**
Display message that summarization requires at least one configured provider (ZhiPu, MiniMax, or DeepSeek).

**If MCP server not available:**
Display error and suggest running `oh-my-claude doctor`.

**If no memories in date range:**
Display message and suggest trying a wider date range.

## Examples

```
User: /omc-summary
-> Summarizes memories from the last 7 days

User: /omc-summary 14
-> Summarizes memories from the last 14 days

User: /omc-summary 30 project
-> Summarizes project-specific memories from the last 30 days

User: /omc-summary 7 global
-> Summarizes global memories from the last 7 days
```

ARGUMENTS: $ARGUMENTS
