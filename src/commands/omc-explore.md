# /omc-explore

Fast codebase exploration using Claude Code's built-in Explore agent.

## Instructions

The user wants fast codebase exploration using the **Explore** subagent (Claude Code's built-in).

**To use Explore, call the Task tool:**

```
Task(
  subagent_type="Explore",
  prompt="[what to find/explore in the codebase]"
)
```

> Note: Model selection is handled by Claude Code internally.

**Explore excels at:**
- Finding specific files/functions
- Understanding code flow
- Locating patterns
- Mapping dependencies
- Quick codebase navigation

**For parallel exploration**, launch multiple Task calls simultaneously:

```
Task(subagent_type="Explore", prompt="Find auth implementations...")
Task(subagent_type="Explore", prompt="Find error handling patterns...")
```

Now execute the Explore agent with the user's exploration request.
