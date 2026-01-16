# /omcx-issue

Report a bug to oh-my-claude GitHub Issues.

## Instructions

Create a bug report for the oh-my-claude project with auto-collected environment diagnostics.

### Prerequisites Check

**FIRST**: Verify GitHub MCP is available by calling:
```
mcp__plugin_github_github__get_me()
```

If this fails or the tool is not available, display:
```
GitHub MCP is not available. To report issues, you need the GitHub MCP plugin.

Install it with:
  claude mcp add github -- npx -y @modelcontextprotocol/server-github

Or report manually at: https://github.com/lgcyaxi/oh-my-claude/issues/new
```
Then stop execution.

### Workflow

1. **Collect Environment Diagnostics**

   Run these commands to gather system info:
   ```bash
   # oh-my-claude version
   oh-my-claude --version 2>/dev/null || npx @lgcyaxi/oh-my-claude --version 2>/dev/null || echo "unknown"

   # OS info
   uname -s -r

   # Node.js version
   node --version

   # Bun version (optional)
   bun --version 2>/dev/null || echo "not installed"

   # Installation type detection
   which oh-my-claude >/dev/null 2>&1 && echo "global" || echo "npx"

   # Doctor output (sanitized)
   oh-my-claude doctor --no-color 2>/dev/null || npx @lgcyaxi/oh-my-claude doctor --no-color 2>/dev/null || echo "doctor command failed"
   ```

2. **Gather Issue Details from User**

   Ask the user for:
   - Brief summary of the issue (1 line - used as title)
   - What happened (actual behavior)
   - What was expected
   - Steps to reproduce (optional)
   - Any additional context

3. **Generate Issue Draft**

   Format the issue body:
   ```markdown
   ## Description
   [User's brief summary]

   ## What happened
   [User's actual behavior description]

   ## Expected behavior
   [User's expected behavior]

   ## Steps to reproduce
   [User's steps, or "N/A" if not provided]

   ## Environment

   | Component | Value |
   |-----------|-------|
   | oh-my-claude | [version] |
   | OS | [os info] |
   | Node.js | [version] |
   | Bun | [version or "not installed"] |
   | Installation | [global/npx] |

   <details>
   <summary>Doctor output</summary>

   ```
   [doctor command output - sanitized, no API keys]
   ```

   </details>

   ## Additional context
   [User's additional context, or "None"]

   ---
   *Reported via `/omcx-issue` command*
   ```

4. **Show Draft and Request Confirmation**

   Display the complete issue to the user:
   ```
   Issue Draft
   -----------

   Title: [Bug] [summary]

   [issue body]

   -----------

   Does this look correct?
   - "yes" or "submit" to create the issue
   - "edit" to modify before submitting
   - "cancel" to abort
   ```

5. **Submit Issue**

   On confirmation, create the issue:
   ```
   mcp__plugin_github_github__issue_write(
     method: "create",
     owner: "lgcyaxi",
     repo: "oh-my-claude",
     title: "[Bug] <user's summary>",
     body: "<generated body>",
     labels: ["bug", "user-reported"]
   )
   ```

6. **Report Result**

   On success:
   ```
   Issue created successfully!

   View at: https://github.com/lgcyaxi/oh-my-claude/issues/<number>

   Thank you for helping improve oh-my-claude!
   ```

   On failure:
   ```
   Failed to create issue: <error message>

   You can report manually at: https://github.com/lgcyaxi/oh-my-claude/issues/new
   ```

### Important Notes

- Always sanitize doctor output - never include API keys
- Use `npx @lgcyaxi/oh-my-claude` as fallback when global command unavailable
- Labels "bug" and "user-reported" are applied automatically
- Issue title format: `[Bug] <user's summary>`

### Arguments

`/omcx-issue [quick description]`

- If description provided: Use as the issue summary
- If no description: Prompt user for issue summary

### Examples

```
/omcx-issue commands not installing properly
/omcx-issue MCP server fails to connect
/omcx-issue oracle agent returns empty response
/omcx-issue
```
