# Coworker Smoke Tests

Minimal end-to-end validation for the OpenCode native coworker runtime.

## Scope

These tests verify that:

- OpenCode starts `opencode serve`, creates a session, records coworker activity, sends one message,
  and returns a response

They are intentionally small. They validate startup and one successful task, not full feature
coverage.

## Commands

### OpenCode

```bash
bun run test:smoke:opencode
```

Direct form:

```bash
OPENCODE_NO_VIEWER=1 OMC_RUN_OPENCODE_SMOKE=1 bun test tests/coworker/opencode-smoke.test.ts
```

### All

```bash
bun run test:smoke:coworker
```

## Prerequisites

### OpenCode

- `opencode` installed and available on `PATH`
- permission to bind a local loopback port
- at least one primary agent exposed by `/agent`

The OpenCode coworker uses the official server message API shape:

- `POST /session/{sessionID}/message`
- body includes `agent` and `parts`

At runtime, oh-my-claude selects agent `build` if available; otherwise it picks the first
non-`subagent` primary agent. This matches the server/SDK contract documented by OpenCode:

- [OpenCode Server](https://opencode.ai/docs/server/)
- [OpenCode SDK](https://opencode.ai/docs/sdk/)

After a smoke run, inspect live coworker logs with `omc m opencode log`. Use
`--raw` to inspect the unaggregated event stream, and `omc m opencode viewer` to
re-open the OpenCode panel if it was closed.

## CI Usage

These smoke tests are optional by design. They should only run in CI jobs that have the required
local/runtime dependencies.

Example:

```bash
bun run typecheck
bun run build
bun run test:smoke:coworker
```

If your CI environment cannot access external services or user config directories, keep these smoke
tests disabled and run only unit/build checks.

## Feature Tests

Run the non-networked interface regression tests when changing coworker protocol or MCP surfaces:

```bash
bun test tests/coworker/feature-extensions.test.ts
bun test tests/coworker/timeout-cancel.test.ts
```
