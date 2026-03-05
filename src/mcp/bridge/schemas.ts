import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const bridgeToolSchemas: Tool[] = [
  {
    name: "bridge_send",
    description: `Send a task to a running CLI tool (codex, opencode, gemini, cc) via the Multi-AI Bridge.

If the AI is not already running in bridge state, it will be spawned automatically.
- Proc-based workers (codex via CodexAppServerDaemon): uses orchestrator.delegate() — reliable, no pane needed.
- Pane-based workers (cc, opencode): injects text via tmux/WezTerm, polls for response.

Use task_spec to provide structured task context (scope, expected output, completion criteria) — prepended to the message as a structured header so the worker understands its mandate.

Use \`bridge up cc --switch ds\` to spawn a CC worker pre-switched to DeepSeek.
Multiple CC instances supported: cc, cc:2, cc:3 (each with its own proxy session).`,
    inputSchema: {
      type: "object",
      properties: {
        ai_name: {
          type: "string",
          description: "Name of the AI assistant to send the message to. Supports: codex, opencode, cc, cc:kimi (Kimi K2.5), cc:zp (ZhiPu GLM), cc:qwen (Qwen 3.5+), cc:mm-cn (MiniMax), cc:ds (DeepSeek), cc:2, cc:N",
        },
        message: {
          type: "string",
          description: "The task or message to send to the AI assistant",
        },
        task_spec: {
          type: "object",
          description: "Optional structured task specification prepended to the message. Helps bridge workers understand scope and completion criteria.",
          properties: {
            scope: { type: "string", description: "What files/components/areas this task covers" },
            expected_output: { type: "string", description: "What the worker should produce (e.g., 'modified files', 'test results', 'explanation')" },
            completion_criteria: { type: "string", description: "How to know the task is done" },
          },
        },
        wait_for_response: {
          type: "boolean",
          default: true,
          description: "Whether to poll for a response from the AI (default: true)",
        },
        timeout_ms: {
          type: "number",
          default: 120000,
          description: "Response timeout in milliseconds (default: 120000 = 2 minutes)",
        },
        auto_close: {
          type: "boolean",
          default: true,
          description: "Automatically close the AI pane after receiving a response (default: true). Set to false to keep the pane alive.",
        },
        stream: {
          type: "boolean",
          default: false,
          description: "Stream partial responses in real-time via proxy capture (requires proxy-mediated capture). Falls back to non-streaming if unavailable.",
        },
      },
      required: ["ai_name", "message"],
    },
  },
  {
    name: "bridge_up",
    description: `Spawn a bridge worker (CC instance) with optional model switching.

Allows dynamically adding bridge workers mid-session without restarting.
The worker runs in a tmux pane with its own proxy session for isolated model switching.

Examples:
- bridge_up("cc:kimi", "kimi") → spawn CC worker pre-switched to Kimi
- bridge_up("cc:ds", "ds") → spawn CC worker pre-switched to DeepSeek
- bridge_up("cc:2") → spawn CC worker without switching`,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Worker name (e.g., cc:kimi, cc:ds, cc:2). Must start with 'cc'.",
        },
        switch_alias: {
          type: "string",
          description: "Optional switch alias (e.g., kimi, ds, mm, glm) to auto-switch the worker after launch.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "bridge_down",
    description: `Stop a running bridge worker and remove it from bridge state.

Kills the worker's tmux pane and removes it from the bridge state file.
If no workers remain after removal, bridge mode constraints are cleared.`,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Worker name to stop (e.g., cc:kimi, cc:ds, cc:2).",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "bridge_status",
    description: `Get the status of all active bridge workers.

Use before bridge_send to verify a worker is running and check its current state.
For proc-based workers (codex), returns live state from the status signal file.
For pane-based workers (cc, opencode), returns "running" (no live signal available).

Returns: { workers: [{name, type, status, startedAt, projectPath}], count }`,
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "bridge_dispatch",
    description: `Dispatch a structured task to a worker via the Bridge Bus (HTTP broker, port 18912).

Unlike bridge_send (pane-based), bridge_dispatch uses a reliable HTTP bus server.
The bus auto-starts if not running. Workers poll the bus for tasks.

Use bridge_wait to block until task(s) complete.
Use bridge_send for legacy pane-based communication.`,
    inputSchema: {
      type: "object",
      properties: {
        worker: {
          type: "string",
          description: "Target worker name (e.g., cc:zp, cc:ds, cc:2)",
        },
        mandate: {
          type: "object",
          description: "Structured task mandate for the worker",
          properties: {
            role: { type: "string", description: "Worker role (code, audit, docs, design)" },
            scope: { type: "string", description: "What files/components/areas this task covers" },
            goal: { type: "string", description: "What the worker should accomplish" },
            acceptance: { type: "string", description: "How to know the task is done" },
            context: { type: "string", description: "Optional additional context" },
          },
          required: ["role", "scope", "goal", "acceptance"],
        },
      },
      required: ["worker", "mandate"],
    },
  },
  {
    name: "bridge_wait",
    description: `Wait for one or more bus tasks to complete. Blocks until results are ready.

Supports "all" (wait for every task) or "any" (first completion) modes.
Max timeout 300s. Use after bridge_dispatch to collect results.`,
    inputSchema: {
      type: "object",
      properties: {
        task_ids: {
          type: "array",
          items: { type: "string" },
          description: "Task IDs to wait for (from bridge_dispatch)",
        },
        mode: {
          type: "string",
          enum: ["all", "any"],
          description: "Wait mode: 'all' waits for every task, 'any' returns on first completion (default: all)",
        },
        timeout_ms: {
          type: "number",
          description: "Maximum wait time in ms (default: 300000, max: 300000)",
        },
      },
      required: ["task_ids"],
    },
  },
  {
    name: "bridge_event",
    description: `Post an event from a bridge worker to the bus. Worker-side only.

Used by workers to report task progress and completion back to the main CC instance.
Only available inside bridge workers (OMC_BRIDGE_PANE=1).

Event types: accepted, progress, completed, failed, log.
For "completed", include result in payload: { message, files?, data? }
For "failed", include error in payload: { error: "reason" }`,
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "Task ID this event belongs to",
        },
        type: {
          type: "string",
          enum: ["accepted", "progress", "completed", "failed", "log"],
          description: "Event type",
        },
        payload: {
          type: "object",
          description: "Event-specific data. For 'completed': { message, files?, data? }. For 'failed': { error }",
        },
      },
      required: ["task_id", "type"],
    },
  },
];
