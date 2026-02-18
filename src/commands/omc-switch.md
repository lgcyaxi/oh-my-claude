# /omc-switch

Switch Claude Code's model to an external provider via the oh-my-claude proxy.

## Instructions

The user wants to **switch models** in-conversation. This routes all subsequent Claude Code requests through an external provider via the oh-my-claude proxy until manually reverted.

**Parse the arguments** to determine: provider and model.

### Common shortcuts

| Shortcut | Provider | Model |
|----------|----------|-------|
| `deepseek` or `ds` | deepseek | deepseek-chat |
| `deepseek-reasoner` or `ds-r` | deepseek | deepseek-reasoner |
| `zhipu` or `zp` | zhipu | GLM-5 |
| `minimax` or `mm` | minimax | MiniMax-M2.5 |
| `kimi` or `km` | kimi | K2.5 |
| `gpt` or `openai` | openai | gpt-5.3-codex |
| `codex` or `cx` | openai | gpt-5.3-codex |
| `copilot` or `cp` | copilot | gpt-5.3-codex |

### Step 1: Switch the model

```
Use mcp__oh-my-claude-background__switch_model with:
- provider: [resolved provider name]
- model: [resolved model name]
```

The switch is permanent — all subsequent requests route to the specified provider until manually reverted.

### Step 2: Confirm to the user

Tell the user the model is switched and will remain active until they revert.

### Examples

```
/omc-switch ds                            → switch_model(deepseek, deepseek-chat)
/omc-switch deepseek deepseek-chat        → switch_model(deepseek, deepseek-chat)
/omc-switch ds-r                          → switch_model(deepseek, deepseek-reasoner)
/omc-switch zhipu GLM-5                   → switch_model(zhipu, GLM-5)
/omc-switch zp                            → switch_model(zhipu, GLM-5)
/omc-switch minimax MiniMax-M2.5          → switch_model(minimax, MiniMax-M2.5)
/omc-switch mm                            → switch_model(minimax, MiniMax-M2.5)
/omc-switch km                            → switch_model(kimi, K2.5)
/omc-switch kimi K2.5                     → switch_model(kimi, K2.5)
/omc-switch gpt                           → switch_model(openai, gpt-5.3-codex)
/omc-switch cx                            → switch_model(openai, gpt-5.3-codex)
/omc-switch cp                            → switch_model(copilot, gpt-5.3-codex)
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
