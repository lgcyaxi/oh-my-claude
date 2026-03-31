# /omc-switch

Show available models and switch provider for this session.

## Instructions

**Step 1: Output this reference table immediately (no tool calls).**

```
/omc-switch [shortcut|model-id]  ·  switch provider for this session
──────────────────────────────────────────────────────────────────────
 Shortcut  Model ID               Label                  Provider
──────────────────────────────────────────────────────────────────────
 q         qwen3.5-plus           Qwen 3.5 Plus          aliyun
 qc        qwen3-coder-plus       Qwen 3 Coder Plus      aliyun
 qn        qwen3-coder-next       Qwen 3 Coder Next      aliyun
 qm        qwen3-max-2026-01-23   Qwen 3 Max             aliyun
 g4        glm-4.7                GLM 4.7                aliyun
 g5a       glm-5-ay               GLM-5 (Aliyun)         aliyun
 ka        kimi-k2.5              Kimi K2.5 (Aliyun)     aliyun
 ma        MiniMax-M2.5-ay        MiniMax M2.5 (Aliyun)  aliyun
 dr        deepseek-reasoner      DeepSeek Reasoner      deepseek
 ds        deepseek-chat          DeepSeek Chat          deepseek
 g51       glm-5.1                ZhiPu GLM-5.1           zhipu
 g5        glm-5                  ZhiPu GLM-5            zhipu
 mm        MiniMax-M2.5           MiniMax M2.5           minimax-cn
 km        kimi-for-coding        Kimi K2.5              kimi
──────────────────────────────────────────────────────────────────────
 c / revert                       → revert to native Claude
──────────────────────────────────────────────────────────────────────
```

**Step 2: Check if an argument was provided.**

Shortcut → model/provider lookup:
- `q`   → provider: `aliyun`,    model: `qwen3.5-plus`
- `qc`  → provider: `aliyun`,    model: `qwen3-coder-plus`
- `qn`  → provider: `aliyun`,    model: `qwen3-coder-next`
- `qm`  → provider: `aliyun`,    model: `qwen3-max-2026-01-23`
- `g4`  → provider: `aliyun`,    model: `glm-4.7`
- `g5a` → provider: `aliyun`,    model: `glm-5-ay`
- `ka`  → provider: `aliyun`,    model: `kimi-k2.5`
- `ma`  → provider: `aliyun`,    model: `MiniMax-M2.5-ay`
- `dr`  → provider: `deepseek`,  model: `deepseek-reasoner`
- `ds`  → provider: `deepseek`,  model: `deepseek-chat`
- `g51` → provider: `zhipu`,     model: `glm-5.1`
- `g5`  → provider: `zhipu`,     model: `glm-5`
- `mm`  → provider: `minimax-cn`,model: `MiniMax-M2.5`
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
