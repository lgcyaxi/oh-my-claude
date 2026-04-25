# /omc-switch

Show available models and switch provider for this session.

## Instructions

**Step 1: Output this reference table immediately (no tool calls).**

```
/omc-switch [shortcut|model-id]  ·  switch provider for this session
──────────────────────────────────────────────────────────────────────
 Shortcut  Model ID               Label                  Provider
──────────────────────────────────────────────────────────────────────
 q         qwen3.6-plus           Qwen 3.6 Plus          aliyun
 qc        qwen3-coder-plus       Qwen 3 Coder Plus      aliyun
 qn        qwen3-coder-next       Qwen 3 Coder Next      aliyun
 qm        qwen3-max-2026-01-23   Qwen 3 Max             aliyun
 g4        glm-4.7                GLM 4.7                aliyun
 g5a       glm-5-ay               GLM-5 (Aliyun)         aliyun
 ka        kimi-k2.5              Kimi K2.5 (Aliyun)     aliyun
 q36       qwen3.6-plus           Qwen 3.6 Plus          aliyun
 ds        deepseek-v4-pro        DeepSeek V4 Pro        deepseek
 dr        deepseek-v4-pro        DeepSeek V4 Pro (Rsn)  deepseek
 ds-f      deepseek-v4-flash      DeepSeek V4 Flash      deepseek
 g51       glm-5.1                ZhiPu GLM-5.1          zhipu
 g5t       glm-5-turbo            ZhiPu GLM-5 Turbo      zhipu
 g5        glm-5                  ZhiPu GLM-5            zhipu
 gair      glm-4.5-air            ZhiPu GLM-4.5 Air      zhipu
 mm        MiniMax-M2.7           MiniMax M2.7           minimax-cn
 km        kimi-for-coding        Kimi K2.5              kimi
──────────────────────────────────────────────────────────────────────
 c / revert                       → revert to native Claude
──────────────────────────────────────────────────────────────────────
```

**Tier mapping (applied automatically for DeepSeek / ZhiPu / Z.AI):**

| Claude tier | DeepSeek              | GLM          |
|-------------|-----------------------|--------------|
| `opus`      | `deepseek-v4-pro` (effort=max)  | `glm-5.1`    |
| `sonnet`    | `deepseek-v4-pro` (effort=high) | `glm-5-turbo`|
| `haiku`     | `deepseek-v4-flash` (fast path) | `glm-4.5-air`|

Once switched to DeepSeek or ZhiPu/Z.AI, Claude Code's own `haiku/sonnet/opus`
tier requests are rewritten to the matching provider model and effort without
needing any environment variable.

**Step 2: Check if an argument was provided.**

Shortcut → model/provider lookup:
- `q`   → provider: `aliyun`,    model: `qwen3.6-plus`
- `qc`  → provider: `aliyun`,    model: `qwen3-coder-plus`
- `qn`  → provider: `aliyun`,    model: `qwen3-coder-next`
- `qm`  → provider: `aliyun`,    model: `qwen3-max-2026-01-23`
- `g4`  → provider: `aliyun`,    model: `glm-4.7`
- `g5a` → provider: `aliyun`,    model: `glm-5-ay`
- `ka`  → provider: `aliyun`,    model: `kimi-k2.5`
- `q36` → provider: `aliyun`,    model: `qwen3.6-plus`
- `ds`  → provider: `deepseek`,  model: `deepseek-v4-pro`
- `dr`  → provider: `deepseek`,  model: `deepseek-v4-pro` (V4 unified, thinking effort=max)
- `ds-f`→ provider: `deepseek`,  model: `deepseek-v4-flash` (haiku tier, fast path)
- `g51` → provider: `zhipu`,     model: `glm-5.1`
- `g5t` → provider: `zhipu`,     model: `glm-5-turbo`
- `g5`  → provider: `zhipu`,     model: `glm-5`
- `gair`→ provider: `zhipu`,     model: `glm-4.5-air`
- `mm`  → provider: `minimax-cn`,model: `MiniMax-M2.7`
- `km`  → provider: `kimi`,      model: `kimi-for-coding`
- `c` / `revert` / any `claude-*` → revert

Full model IDs are also accepted (look up provider from table above).

**If switching:**
- Call `mcp__oh-my-claude__switch_model` with resolved `provider` and `model`
- Confirm: "Switched to {model} ({Provider}) for this session."

**If reverting (`c` / `revert`):**
- Call `mcp__oh-my-claude__switch_revert`
- Confirm: "Reverted to native Claude."

**If no argument:** output table only, no tool calls.
