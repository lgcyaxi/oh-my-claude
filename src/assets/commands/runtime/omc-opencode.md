# /omc-opencode

Invoke OpenCode for refactoring, UI design, and code comprehension.

## Instructions

Activate OpenCode for tasks requiring code refactoring, UI/UX design, or code
understanding. Prefer task-style delegation: describe the outcome and
constraints, not a detailed implementation script.

**Usage:** `/omc-opencode <task description>`

**Examples:**

- `/omc-opencode refactor this component to use React hooks`
- `/omc-opencode design a dark-themed login page`
- `/omc-opencode explain how the authentication flow works`

## Agent Capabilities

**OpenCode specializes in:**

- Code refactoring (rename, restructure, extract)
- UI/UX design and implementation
- Code comprehension and explanation
- Pattern-based code transformations
- Natural language code search

**Fallback Strategy:**

1. Try OpenCode first (if installed)
2. Fall back to `/codex:rescue` for scaffolding or self-contained parallel tasks
3. Fall back to Claude native for architecture decisions

## Execution

**Step 1: Invoke the OpenCode coworker**

```javascript
await coworker_task({
  action: "send",
  target: "opencode",
  message: "<user's task description>",
  timeout_ms: 120000,
  agent: "build",                    // optional; any live /agent entry, including plugin agents
  provider_id: "minimax-cn",         // optional, must pair with model_id
  model_id: "MiniMax-M2.7"           // optional, must pair with provider_id
});
```

**Step 2: Handle fallback if OpenCode not available** If OpenCode CLI is not
installed or `opencode serve` fails to start, delegate to `/codex:rescue` for
implementation tasks, or use Claude native for analysis.

**Step 3: Return results** Present the results from OpenCode to the user,
including any code changes, explanations, or design recommendations.

**Step 4: Surface observability when helpful** If the user asks for progress,
troubleshooting, or approvals, use `coworker_task(action="status")` and
`coworker_task(action="recent_activity", target="opencode")`. Mention `omc m opencode log` for
a live terminal view of the OpenCode coworker activity log. If the user closes
the panel, mention `omc m opencode viewer` to re-attach it. If approvals are
pending, surface `requestId`, `kind`, `status`, `lastEventType`,
`decisionOptions`, and `details` from `pendingApprovals`.
If no approvals appear, explain that OpenCode permission mode is controlled by
the active OpenCode agent/session environment; this runtime currently surfaces
native permission events and responses but does not invent a stricter local
approval mode.

**Step 5: Use native coworker controls when needed** OpenCode now supports:
- `coworker_task(action="review"|...)` as a unified control surface
- `coworker_task(action="review", ...)` for structured review prompts
  - optional `paths` for scoped review prompts
- `coworker_task(action="diff", target="opencode")` for session diff inspection
- `coworker_task(action="fork", target="opencode")` for session forks
- `coworker_task(action="revert", target="opencode")` for revert / unrevert
- `coworker_task(action="approve", target="opencode")` for permission responses

Use `coworker_task(action=...)` as the control surface for all OpenCode
operations.

Coverage boundary: oh-my-claude implements only the native execution-path
subset for the OpenCode coworker: `send`, `review`, `diff`, `fork`, `revert`,
`approve`, `status`, and `recentActivity`. It does not expose the full
OpenCode client/session surface.

---

**Memory Integration (MANDATORY):**

- **Before working**: call `mcp__oh-my-claude__recall` with keywords from the
  request to check for prior design decisions and patterns.
- **After completing**: call `mcp__oh-my-claude__remember` to store key
  refactoring decisions, UI patterns, and code organization insights.

**Note:** OpenCode now runs as a native coworker runtime through
`opencode serve`. Prefer outcome-oriented delegation rather than step-by-step
scripting. It auto-opens a viewer when available and still writes native status
and activity signals, so statusline and log-based feedback remain available
even if the viewer cannot attach. The viewer now attaches to the active session
and the runtime drives TUI controls such as session selection and toast
notifications while the task runs. The panel now auto-closes after an idle
period unless `OPENCODE_KEEP_VIEWER=1` is set. Defaults can be pinned with:
- `OMC_OPENCODE_AGENT=<agent-name>`
- `OMC_OPENCODE_PROVIDER=<provider-id>`
- `OMC_OPENCODE_MODEL=<model-id>`

Per-request overrides win over environment defaults. OpenCode agent selection
is resolved only from the live `/agent` list exposed by `opencode serve`. This
includes native agents such as `build/general/explore` and any plugin agents
the server exposes. Short names are accepted only when they uniquely resolve
within that `/agent` list.
OpenCode permission responses also accept common aliases such as
`approve/accept/allow` and `deny/reject`.
