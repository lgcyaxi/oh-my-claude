# /omc-mem-clear

AI-powered selective memory cleanup. Identifies outdated, redundant, or irrelevant memories for removal. **Important**: Deleted memories are recorded in Timeline with strikethrough format (~~title~~) but WITHOUT keywords/tags, making them unsearchable via recall.

## Instructions

The user wants to clean up their memories. This command uses AI to analyze all stored memories and suggest which ones can be safely deleted. After deletion, Timeline is updated to show what was removed (title only, no tags).

## Arguments

- `[scope]` - Optional: "project", "global", or "all" (default: all)

## Timeline Recording After Clear

When memories are deleted, Timeline records them as:
```markdown
### Feb 17
- 🗑️ ~~Old bridge testing session~~
```

This preserves "what was done" but removes keyword tags so `recall` cannot find the deleted content.

## Workflow

**Step 1: Get memory status**

```
Use mcp__oh-my-claude-background__memory_status to show current memory statistics
```

Display a summary:
```
Memory Cleanup
==============
Total: X memories (Y project, Z global)
- Notes: N
- Sessions: M
```

**Step 2: Analyze memories**

```
Use mcp__oh-my-claude-background__clear_memories with:
- mode: "analyze"
- scope: <from arguments, default "all">
```

This uses AI (ZhiPu -> MiniMax -> DeepSeek) to identify deletion candidates.

**Step 3: Display deletion candidates**

Format the results as:

```
Deletion Candidates
===================

[HIGH] memory-id-1: "Title Here"
  Reason: Outdated session from 2 weeks ago, no longer relevant
  Timeline record: "~~Title Here~~"

[HIGH] memory-id-2: "Another Title"
  Reason: Duplicate of newer memory about same topic
  Timeline record: "~~Another Title~~"

[MEDIUM] memory-id-3: "Third Title"
  Reason: Trivial debugging note, unlikely to be useful

Keeping (N memories):
  - memory-id-x: "Important Pattern" - Architectural decision
  - memory-id-y: "Bug Fix Notes" - Lesson learned
```

**Step 4: Ask for confirmation**

Ask the user which memories to delete:
- "all" - Delete all candidates
- "high" - Delete only high-confidence candidates
- "1,2,3" - Delete specific candidates by number
- "none" - Cancel without changes

**Step 5: Execute deletion with Timeline recording**

If user confirms, execute:

```
Use mcp__oh-my-claude-background__clear_memories with:
- mode: "execute"
- ids: <selected memory IDs>
- recordInTimeline: true
- removeTags: true  (removes keywords from Timeline record)
```

**Step 6: Show results**

Display results:
```
Cleanup Complete
================
- Deleted: X memories
- Failed: Y (if any)
- Remaining: Z memories
- Timeline updated with cleared entries (no keywords)

Deleted:
- memory-id-1: "Title 1"
- memory-id-2: "Title 2"

Timeline records created (strikethrough, no tags):
- 🗑️ ~~Title 1~~
- 🗑️ ~~Title 2~~
```

## Error Handling

**If no AI provider available:**
Display message that memory cleanup requires at least one configured provider (ZhiPu, MiniMax, or DeepSeek).

**If MCP server not available:**
Display error and suggest running `oh-my-claude doctor`.

**If no memories found:**
Display message that there are no memories to analyze.

## Examples

```
User: /omc-mem-clear
-> Analyzes all memories and suggests cleanup

User: /omc-mem-clear project
-> Only analyzes project-specific memories

User: /omc-mem-clear global
-> Only analyzes global memories
```

ARGUMENTS: $ARGUMENTS
