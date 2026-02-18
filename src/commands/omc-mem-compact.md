# /omc-mem-compact

Compact and organize **notes only** using AI-assisted grouping. Sessions are NOT processed by this command - use `/omc-mem-daily` for sessions.

## Instructions

The user wants to compact their notes. This command analyzes all stored notes (type="note") and suggests groups that can be merged together based on similarity.

## Arguments

- `[scope]` - Optional: "project", "global", or "all" (default: all)

## Workflow

**Step 1: Get memory status**

```
Use mcp__oh-my-claude-background__memory_status to show current memory statistics
```

Display a summary:
```
Memory Status (Notes Only)
==========================
Total Notes: X (Y project, Z global)
Sessions: M (not processed - use /omc-mem-daily)
```

**Step 2: Analyze notes**

```
Use mcp__oh-my-claude-background__compact_memories with:
- mode: "analyze"
- type: "note"
- scope: <from arguments, default "all">
```

This uses AI (ZhiPu -> MiniMax -> DeepSeek) to analyze notes and suggest merge groups.

**Step 3: Display suggested groups**

Format the suggestions as:

```
Suggested Compaction Groups
===========================

Group 1: "Merged Title Here"
  - memory-id-1: "Original Title 1"
  - memory-id-2: "Original Title 2"
  Reason: Brief explanation

Group 2: "Another Merged Title"
  ...

Ungrouped (will stay separate):
  - memory-id-x: "Title X"
```

**Step 4: Ask for confirmation**

Ask the user which groups to compact:
- "all" - Compact all suggested groups
- "1,2,3" - Compact specific groups by number
- "none" - Cancel without changes

**Step 5: Execute compaction**

If user confirms, execute the merge:

```
Use mcp__oh-my-claude-background__compact_memories with:
- mode: "execute"
- groups: <selected groups with ids and titles>
- targetScope: <project or global, prefer project if available>
```

**Step 6: Show results**

Display compaction results:
```
Compaction Complete
===================
- Created: X merged memories
- Deleted: Y original memories
- Failed: Z (if any)

New Memories:
- new-id-1: "Merged Title 1"
- new-id-2: "Merged Title 2"
```

## Error Handling

**If no AI provider available:**
Display message that compaction requires at least one configured provider (ZhiPu, MiniMax, or DeepSeek).

**If MCP server not available:**
Display error and suggest running `oh-my-claude doctor`.

**If not enough memories:**
Display message that there are not enough memories to compact (need at least 2).

## Examples

```
User: /omc-compact
→ Analyzes all memories from both project and global

User: /omc-compact project
→ Only analyzes project-specific memories

User: /omc-compact global
→ Only analyzes global memories
```

ARGUMENTS: $ARGUMENTS
