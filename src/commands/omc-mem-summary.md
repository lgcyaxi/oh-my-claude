# /omc-mem-summary

Consolidate memories from a date range into a compressed timeline summary. This command processes BOTH notes and sessions, creating period-based summaries (weekly/monthly).

## Instructions

The user wants to create a consolidated summary of their memories over a time period. This command collects memories within a date range and uses AI to produce a compressed timeline-style summary. Original files are archived (deleted) after the summary is created.

## Arguments

- `[period]` - Optional: time period (default: 7 days). Options: "7" (week), "14" (2 weeks), "30" (month), or custom days
- `[scope]` - Optional: "project", "global", or "all" (default: all)

## Difference from /omc-mem-daily

| Aspect | /omc-mem-daily | /omc-mem-summary |
|--------|----------------|------------------|
| Scope | Sessions only | Notes + Sessions |
| Time range | Single day | Multi-day period (week/month) |
| Output | Daily narrative | Period compression |
| Purpose | Daily organization | Period cleanup |

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
- "save" - Save the summary and delete original memories (default)
- "save and keep" - Save summary but keep the original memories
- "edit" - Let user modify the summary before saving
- "cancel" - Discard without saving

**Step 5: Execute save**

If user confirms:

```
Use mcp__oh-my-claude-background__summarize_memories with:
- mode: "execute"
- summary: <the summary text>
- title: <the suggested title>
- tags: <the suggestedTags array from analyze response - includes all keywords for retrieval>
- archiveOriginals: <false ONLY if user chose "save and keep", otherwise omit (defaults to true)>
- originalIds: <list of memory IDs that were summarized>
- targetScope: <project or global, prefer project if available>
```

IMPORTANT: Always pass the `tags` array from the analyze response's `suggestedTags`. These contain all keywords from the original memories needed for proper retrieval.

**Step 6: Show results**

Display results:
```
Summary Saved
=============
- New memory: <summary-id> "<Summary Title>"
- Tags: <list of tags>
- Deleted: X original memories
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
User: /omc-mem-summary
-> Summarizes memories from the last 7 days

User: /omc-mem-summary 14
-> Summarizes memories from the last 14 days

User: /omc-mem-summary 30 project
-> Summarizes project-specific memories from the last 30 days

User: /omc-mem-summary 7 global
-> Summarizes global memories from the last 7 days
```

ARGUMENTS: $ARGUMENTS
