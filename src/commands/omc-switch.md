# /omc-switch

Switch Claude Code's model to an external provider via the oh-my-claude proxy.

## Instructions

The user wants to **switch models** in-conversation. This routes the next N Claude Code requests through an external provider (DeepSeek, ZhiPu, MiniMax) via the oh-my-claude proxy.

**Parse the arguments** to determine: provider, model, and optional request count.

### Common shortcuts

| Shortcut | Provider | Model |
|----------|----------|-------|
| `deepseek` or `ds` | deepseek | deepseek-chat |
| `deepseek-reasoner` or `ds-r` | deepseek | deepseek-reasoner |
| `zhipu` or `zp` | zhipu | glm-4.7 |
| `minimax` or `mm` | minimax | MiniMax-M2.1 |

### Step 1: Switch the model

**Request count rules:**
- **-1 = unlimited** (stay switched forever until manual `/omc-switch revert`). Pass `requests=-1` directly.
- **N ≥ 1**: Pass the exact count. The proxy automatically skips initial overhead requests (MCP tool + confirmation).
  - User asks for 1 → `switch_model(requests=1)`
  - User asks for 3 → `switch_model(requests=3)`
  - No count specified → `switch_model(requests=1)` [default]

```
Use mcp__oh-my-claude-background__switch_model with:
- provider: [resolved provider name]
- model: [resolved model name]
- requests: [-1 if unlimited, else exact user-requested count]
- timeout_ms: [optional, default 600000; omit for unlimited]
```

### Step 2: Confirm to the user

- **Unlimited**: Tell user the model is switched permanently until they revert.
- **Limited (N)**: Tell user the exact number of user-requested requests remaining.

### Examples

```
/omc-switch ds -1                         → switch_model(requests=-1)  UNLIMITED
/omc-switch deepseek deepseek-chat        → switch_model(requests=1)   1 request
/omc-switch ds                            → switch_model(requests=1)   1 request
/omc-switch ds-r 3                        → switch_model(requests=3)   3 requests
/omc-switch zhipu glm-4.7 5              → switch_model(requests=5)   5 requests
/omc-switch minimax MiniMax-M2.1          → switch_model(requests=1)   1 request
```

### Revert

To revert back to native Claude immediately:

```
Use mcp__oh-my-claude-background__switch_revert
```

If the user says "revert", "back to claude", or "switch back", call switch_revert instead.

### Prerequisites

The oh-my-claude proxy must be running. If the switch fails, suggest:
```
oh-my-claude proxy enable
oh-my-claude proxy start
export ANTHROPIC_BASE_URL=http://localhost:18910
```

Now parse the user's arguments and execute the switch.
