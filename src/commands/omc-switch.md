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
- **-1 = unlimited** (stay switched forever until manual `/omc-switch revert`). Pass `requests=-1` directly, do NOT add +1.
- **N ≥ 1**: Add +1 to account for this confirmation response consuming one request.
  - User asks for 1 → `switch_model(requests=2)`
  - User asks for 3 → `switch_model(requests=4)`
  - No count specified → `switch_model(requests=2)` [default 1 + 1]

```
Use mcp__oh-my-claude-background__switch_model with:
- provider: [resolved provider name]
- model: [resolved model name]
- requests: [-1 if unlimited, else number + 1]
- timeout_ms: [optional, default 600000; omit for unlimited]
```

### Step 2: Confirm to the user

- **Unlimited (0)**: Tell user the model is switched permanently until they revert.
- **Limited (N)**: Tell user how many **user-requested** requests remain (subtract 1 from actual count, since this confirmation uses one).

### Examples

```
/omc-switch ds -1                         → Switch to DeepSeek Chat UNLIMITED (forever)
/omc-switch deepseek deepseek-chat        → Switch 1 request to DeepSeek Chat
/omc-switch ds                            → Switch 1 request to DeepSeek Chat (shortcut)
/omc-switch ds-r 3                        → Switch 3 requests to DeepSeek Reasoner
/omc-switch zhipu glm-4.7 5              → Switch 5 requests to ZhiPu GLM-4.7
/omc-switch minimax MiniMax-M2.1          → Switch 1 request to MiniMax
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
