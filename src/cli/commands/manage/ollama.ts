/**
 * ollama command — Manage Ollama embedding models for memory semantic search
 *
 * Usage:
 *   omc m ollama             # Check status + interactive pull
 *   omc m ollama status      # Check Ollama running state + pulled models
 *   omc m ollama pull        # Pull a popular embedding model (interactive)
 *   omc m ollama pull <model> # Pull a specific model directly
 *   omc m ollama use <model>  # Configure oh-my-claude to use a pulled model
 */

import type { Command } from "commander";
import { execSync, spawnSync } from "node:child_process";
import { createFormatters } from "../../utils/colors";

// ─── Popular embedding models ─────────────────────────────────────────────────

interface EmbeddingModel {
  name: string;         // ollama pull name
  display: string;      // friendly label
  dimensions: number;
  description: string;
  size: string;         // rough disk size
}

const POPULAR_EMBEDDING_MODELS: EmbeddingModel[] = [
  {
    name: "nomic-embed-text",
    display: "nomic-embed-text",
    dimensions: 768,
    description: "Best general-purpose; excellent for semantic search (recommended)",
    size: "274 MB",
  },
  {
    name: "mxbai-embed-large",
    display: "mxbai-embed-large",
    dimensions: 1024,
    description: "High-accuracy large model; strong for code + text",
    size: "670 MB",
  },
  {
    name: "snowflake-arctic-embed",
    display: "snowflake-arctic-embed",
    dimensions: 1024,
    description: "Arctic embedding; competitive with large commercial models",
    size: "670 MB",
  },
  {
    name: "all-minilm",
    display: "all-minilm",
    dimensions: 384,
    description: "Tiny and fast; good for resource-constrained setups",
    size: "46 MB",
  },
  {
    name: "bge-m3",
    display: "bge-m3",
    dimensions: 1024,
    description: "Multilingual; best if your memories contain non-English content",
    size: "1.2 GB",
  },
  {
    name: "qwen3-embedding",
    display: "qwen3-embedding",
    dimensions: 2560,
    description: "Alibaba Qwen3 embedding; strong multilingual + code understanding",
    size: "4.7 GB",
  },
];

/**
 * Name patterns that indicate a model is an embedding model.
 * Used to filter the pulled model list so only embedding-capable
 * models appear in the `use` action selector.
 */
const EMBEDDING_NAME_PATTERNS = [
  /embed/i,
  /embedding/i,
  /minilm/i,
  /bge-/i,
  /e5-/i,
  /sentence/i,
  /gte-/i,
];

/** Returns true if the model name matches a known embedding model or a heuristic pattern. */
function isEmbeddingModel(modelName: string): boolean {
  // Strip tag suffix (e.g. ":latest") for matching
  const base = modelName.split(":")[0] ?? modelName;
  if (POPULAR_EMBEDDING_MODELS.some((e) => base === e.name || base.startsWith(e.name))) return true;
  return EMBEDDING_NAME_PATTERNS.some((re) => re.test(base));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOllamaInstalled(): boolean {
  try {
    execSync("which ollama", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function isOllamaRunning(): boolean {
  try {
    const result = execSync("curl -s --max-time 2 http://localhost:11434/api/tags", {
      stdio: "pipe",
      encoding: "utf-8",
    });
    return result.includes("models");
  } catch {
    return false;
  }
}

function getPulledModels(): string[] {
  try {
    const result = execSync("ollama list 2>/dev/null", {
      stdio: "pipe",
      encoding: "utf-8",
    });
    return result
      .split("\n")
      .slice(1) // skip header
      .map((line) => line.split(/\s+/)[0])
      .filter((x): x is string => !!x);
  } catch {
    return [];
  }
}

function setConfig(key: string, value: string): boolean {
  try {
    execSync(`oh-my-claude manage config --set ${key}=${value}`, {
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Root action (interactive) ────────────────────────────────────────────────

async function ollamaRootAction() {
  const { c, ok, fail, warn, dimText } = createFormatters();

  console.log(`${c.bold}Ollama Embedding Setup${c.reset}  ${c.dim}(for oh-my-claude memory)${c.reset}\n`);

  if (!isOllamaInstalled()) {
    console.log(warn("Ollama is not installed."));
    console.log(`  Install it first: ${c.cyan}omc tools install ollama${c.reset}`);
    console.log(`  Or visit: ${dimText("https://ollama.com")}`);
    process.exit(1);
  }

  const running = isOllamaRunning();
  if (!running) {
    console.log(warn("Ollama is installed but not running."));
    console.log(`  Start it with: ${c.cyan}ollama serve${c.reset}`);
    console.log(`  ${dimText("Tip: set up ollama as a background service so it starts automatically.")}\n`);
  } else {
    console.log(ok("Ollama is running (http://localhost:11434)\n"));
  }

  const pulled = getPulledModels();
  const embeddingPulled = pulled.filter(isEmbeddingModel);

  if (embeddingPulled.length > 0) {
    console.log(`${c.bold}Pulled embedding models:${c.reset}`);
    for (const m of embeddingPulled) {
      const meta = POPULAR_EMBEDDING_MODELS.find((e) => m.startsWith(e.name));
      console.log(`  ${c.green}✓${c.reset} ${m}${meta ? `  ${c.dim}${meta.dimensions}d${c.reset}` : ""}`);
    }
    console.log();
  }

  // Offer to pull or configure
  const { select } = await import("@inquirer/prompts");
  const action = await select({
    message: "What would you like to do?",
    choices: [
      { name: "Pull a popular embedding model", value: "pull" },
      { name: "Configure memory to use a pulled model", value: "use" },
      { name: "Show status only", value: "status" },
      { name: "Cancel", value: "cancel" },
    ],
  });

  if (action === "cancel") { console.log(dimText("Cancelled.")); return; }
  if (action === "status") { await statusAction(); return; }
  if (action === "pull") { await pullAction(undefined); return; }
  if (action === "use") { await useAction(undefined); return; }
}

// ─── Status action ────────────────────────────────────────────────────────────

async function statusAction() {
  const { c, ok, fail, warn, dimText } = createFormatters();

  console.log(`${c.bold}Ollama Status${c.reset}\n`);

  const installed = isOllamaInstalled();
  console.log(installed ? ok("Ollama installed") : fail("Ollama not installed"));
  if (!installed) {
    console.log(`  ${dimText("Install: omc tools install ollama")}`);
    return;
  }

  const running = isOllamaRunning();
  console.log(running ? ok("Ollama running (http://localhost:11434)") : warn("Ollama not running  (start: ollama serve)"));

  const pulled = getPulledModels();
  if (pulled.length === 0) {
    console.log(`\n${dimText("No models pulled yet. Run: omc m ollama pull")}`);
    return;
  }

  const embeddingModels = pulled.filter(isEmbeddingModel);
  const otherModels = pulled.filter((m) => !isEmbeddingModel(m));

  if (embeddingModels.length > 0) {
    console.log(`\n${c.bold}Embedding models:${c.reset}`);
    for (const m of embeddingModels) {
      const meta = POPULAR_EMBEDDING_MODELS.find((e) => m.startsWith(e.name));
      console.log(`  ${c.green}✓${c.reset} ${c.cyan}${m}${c.reset}  ${dimText(meta ? `${meta.dimensions}d — ${meta.description.split(";")[0]}` : "embedding model")}`);
    }
  } else {
    console.log(`\n${dimText("No embedding models pulled yet. Run: omc m ollama pull")}`);
  }

  if (otherModels.length > 0) {
    console.log(`\n${c.bold}Other models (not for embeddings):${c.reset}`);
    for (const m of otherModels) {
      console.log(`  ${c.dim}○${c.reset} ${dimText(m)}`);
    }
  }

  console.log(`\n${dimText("Run 'omc m ollama use' to configure oh-my-claude memory.")}`);
}

// ─── Pull action ──────────────────────────────────────────────────────────────

async function pullAction(modelArg: string | undefined) {
  const { c, ok, fail, warn, dimText } = createFormatters();

  if (!isOllamaInstalled()) {
    console.log(fail("Ollama is not installed. Run: omc tools install ollama"));
    process.exit(1);
  }

  let modelName = modelArg;

  if (!modelName) {
    const pulled = getPulledModels();
    const { select } = await import("@inquirer/prompts");

    const choices = POPULAR_EMBEDDING_MODELS.map((m) => {
      const alreadyPulled = pulled.some((p) => p.startsWith(m.name));
      const label = alreadyPulled
        ? `${m.display}  ${c.green}(pulled)${c.reset}  ${m.dimensions}d  ${m.size}  — ${m.description}`
        : `${m.display}  ${m.dimensions}d  ${m.size}  — ${m.description}`;
      return { name: label, value: m.name };
    });

    choices.push({ name: dimText("Cancel"), value: "__cancel__" });

    modelName = await select({
      message: "Select an embedding model to pull:",
      choices,
    });

    if (modelName === "__cancel__") {
      console.log(dimText("Cancelled."));
      return;
    }
  }

  console.log(`\nPulling ${c.cyan}${modelName}${c.reset} from Ollama registry...\n`);

  const result = spawnSync("ollama", ["pull", modelName], { stdio: "inherit" });

  if (result.status !== 0) {
    console.log(`\n${fail(`Failed to pull ${modelName}`)}`);
    process.exit(1);
  }

  console.log(`\n${ok(`${modelName} pulled successfully`)}`);

  // Offer to configure memory to use it
  const { confirm } = await import("@inquirer/prompts");
  const meta = POPULAR_EMBEDDING_MODELS.find((m) => modelName!.startsWith(m.name));
  const shouldConfigure = await confirm({
    message: `Configure oh-my-claude memory to use ${modelName} for embeddings?`,
    default: true,
  });

  if (shouldConfigure) {
    await applyEmbeddingConfig(modelName, meta?.dimensions);
  } else {
    console.log(`\n${dimText(`Run 'omc m ollama use ${modelName}' later to configure.`)}`);
  }
}

// ─── Use action ───────────────────────────────────────────────────────────────

async function useAction(modelArg: string | undefined) {
  const { c, ok, fail, warn, dimText } = createFormatters();

  if (!isOllamaInstalled()) {
    console.log(fail("Ollama is not installed. Run: omc tools install ollama"));
    process.exit(1);
  }

  const pulled = getPulledModels();
  const embeddingPulled = pulled.filter(isEmbeddingModel);

  if (embeddingPulled.length === 0) {
    console.log(warn("No embedding models pulled yet."));
    console.log(`  Pull one first: ${c.cyan}omc m ollama pull${c.reset}`);
    if (pulled.length > 0) {
      console.log(`  ${dimText(`(${pulled.length} non-embedding model(s) found — not suitable for memory search)`)}`);
    }
    return;
  }

  let modelName = modelArg;

  if (!modelName) {
    const { select } = await import("@inquirer/prompts");
    const choices = [
      ...embeddingPulled.map((m) => {
        const meta = POPULAR_EMBEDDING_MODELS.find((e) => m.startsWith(e.name));
        return {
          name: meta ? `${m}  ${dimText(`${meta.dimensions}d — ${meta.description.split(";")[0]}`)}` : `${m}  ${dimText("embedding model")}`,
          value: m,
        };
      }),
      { name: dimText("Cancel"), value: "__cancel__" },
    ];

    modelName = await select({
      message: "Select embedding model to use for memory:",
      choices,
    });

    if (modelName === "__cancel__") {
      console.log(dimText("Cancelled."));
      return;
    }
  } else {
    const isPulled = pulled.some((p) => p.startsWith(modelName!));
    const isEmbed = isEmbeddingModel(modelName!);
    const { confirm } = await import("@inquirer/prompts");
    if (!isPulled) {
      console.log(warn(`${modelName} does not appear to be pulled yet.`));
      const proceed = await confirm({ message: "Configure anyway?", default: false });
      if (!proceed) return;
    } else if (!isEmbed) {
      console.log(warn(`${modelName} does not appear to be an embedding model.`));
      console.log(dimText("  Non-embedding models cannot generate vector embeddings for memory search."));
      const proceed = await confirm({ message: "Configure anyway?", default: false });
      if (!proceed) return;
    }
  }

  const meta = POPULAR_EMBEDDING_MODELS.find((m) => modelName!.startsWith(m.name));
  await applyEmbeddingConfig(modelName, meta?.dimensions);
}

// ─── Config writer ────────────────────────────────────────────────────────────

async function applyEmbeddingConfig(modelName: string, dimensions?: number) {
  const { c, ok, fail, dimText } = createFormatters();

  console.log(`\nConfiguring oh-my-claude memory to use ${c.cyan}${modelName}${c.reset}...\n`);

  // Set embedding provider to "custom" (Ollama is OpenAI-compatible at /v1/embeddings)
  const steps: Array<[string, string, string]> = [
    ["memory.embedding.provider", "custom", "Set provider to custom (OpenAI-compatible)"],
    ["memory.embedding.model", modelName, `Set model to ${modelName}`],
  ];

  if (dimensions) {
    steps.push(["memory.embedding.dimensions", String(dimensions), `Set dimensions to ${dimensions}`]);
  }

  let allOk = true;
  for (const [key, value, desc] of steps) {
    const success = setConfig(key, value);
    console.log(success ? `  ${ok(desc)}` : `  ${fail(`Failed: ${key}`)}`);
    if (!success) allOk = false;
  }

  // Print env var reminder
  console.log(`\n${c.bold}Required environment variable:${c.reset}`);
  console.log(`  ${c.cyan}export EMBEDDING_API_BASE=http://localhost:11434/v1${c.reset}`);
  console.log(`  ${dimText("Add this to your shell profile (~/.zshrc or ~/.bashrc)")}\n`);

  if (allOk) {
    console.log(ok("Memory embedding configured for Ollama."));
    console.log(dimText("Start Ollama (`ollama serve`) before using semantic memory search."));
  } else {
    console.log(fail("Some config steps failed. Try: omc m config --set <key>=<value>"));
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerOllamaCommand(parent: Command) {
  const ollamaCmd = parent
    .command("ollama")
    .description("Manage Ollama embedding models for memory semantic search")
    .action(ollamaRootAction);

  ollamaCmd
    .command("status")
    .description("Check Ollama running state and pulled embedding models")
    .action(statusAction);

  ollamaCmd
    .command("pull [model]")
    .description("Pull a popular embedding model from Ollama registry")
    .action(pullAction);

  ollamaCmd
    .command("use [model]")
    .description("Configure oh-my-claude memory to use a pulled Ollama model")
    .action(useAction);
}
