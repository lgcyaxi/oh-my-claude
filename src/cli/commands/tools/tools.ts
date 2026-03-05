/**
 * tools command — Install and manage companion tools and MCP servers
 *
 * Consolidates: setup-tools, install-cli, setup-mcp, check-updates
 *
 * Usage:
 *   oh-my-claude tools                    # Interactive menu
 *   oh-my-claude tools install [tool]     # Install CLI tools
 *   oh-my-claude tools mcp [flags]        # Install MCP servers
 *   oh-my-claude tools check [--auto]     # Check for updates
 */

import type { Command } from "commander";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { createFormatters } from "../../utils/colors";

// ─── Shared helpers ──────────────────────────────────────────────────────────

function isInstalled(binary: string): boolean {
  try {
    execSync(process.platform === "win32" ? `where ${binary}` : `which ${binary}`, {
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

function isBunAvailable(): boolean {
  return isInstalled("bun");
}

function getInstallCmd(npmPkg: string): string {
  return isBunAvailable()
    ? `bun install -g ${npmPkg}`
    : `npm install -g ${npmPkg}`;
}

function resolveInstallCmd(cmd: string): string {
  if (isBunAvailable()) {
    return cmd.replace(/^npm install -g /, "bun install -g ");
  }
  return cmd;
}

// ─── CLI Tools definitions ────────────────────────────────────────────────────

interface CliTool {
  name: string;
  value: string;
  description: string;
  binary: string;
  installCmd: string;
  fallbackCmd?: string;
  fallbackNote?: string;
}

const CLI_TOOLS: CliTool[] = [
  {
    name: "OpenCode",
    value: "opencode",
    description: "AI-powered coding assistant by Codeium",
    binary: "opencode",
    installCmd: "npm install -g opencode-ai",
  },
  {
    name: "oh-my-opencode",
    value: "oh-my-opencode",
    description: "Multi-provider plugin for OpenCode (like oh-my-claude for OpenCode)",
    binary: "oh-my-opencode",
    installCmd: "npm install -g oh-my-opencode",
  },
  {
    name: "Codex CLI",
    value: "codex",
    description: "OpenAI Codex command-line tool",
    binary: "codex",
    installCmd: "npm install -g @openai/codex",
    fallbackCmd: "pip install openai-codex",
    fallbackNote: "npm failed, trying pip",
  },
  {
    name: "WezTerm",
    value: "wezterm",
    description: "GPU-accelerated terminal multiplexer for Multi-AI Bridge pane management",
    binary: "wezterm",
    installCmd: process.platform === "win32" ? "winget install wez.wezterm" : "brew install --cask wezterm",
  },
  {
    name: "tmux",
    value: "tmux",
    description: "Terminal multiplexer for Multi-AI Bridge (Unix only)",
    binary: "tmux",
    installCmd: "brew install tmux",
    fallbackCmd: "sudo apt install tmux",
    fallbackNote: "Trying apt...",
  },
  {
    name: "UI UX Pro Max",
    value: "uipro",
    description: "AI design intelligence skill — 67 styles, 96 palettes, 57 font pairings",
    binary: "uipro-cli",
    installCmd: "npm install -g uipro-cli",
  },
  {
    name: "Ollama",
    value: "ollama",
    description: "Local LLM inference server — run embedding models for semantic memory search",
    binary: "ollama",
    installCmd: process.platform === "win32"
      ? "winget install Ollama.Ollama"
      : process.platform === "darwin"
        ? "brew install ollama"
        : "curl -fsSL https://ollama.com/install.sh | sh",
    fallbackCmd: process.platform === "linux" ? undefined : "curl -fsSL https://ollama.com/install.sh | sh",
    fallbackNote: "Trying official install script...",
  },
  {
    name: "uv",
    value: "uv",
    description: "Extremely fast Python package manager (required for MCP servers that use uvx)",
    binary: "uv",
    installCmd: process.platform === "win32"
      ? "winget install astral-sh.uv"
      : "curl -LsSf https://astral.sh/uv/install.sh | sh",
    fallbackCmd: "brew install uv",
    fallbackNote: "Trying brew...",
  },
  {
    name: "Bun",
    value: "bun",
    description: "Fast JavaScript runtime and package manager (used by oh-my-claude build)",
    binary: "bun",
    installCmd: process.platform === "win32"
      ? "powershell -c \"irm bun.sh/install.ps1 | iex\""
      : "curl -fsSL https://bun.sh/install | bash",
  },
  {
    name: "Rust (rustup)",
    value: "rust",
    description: "Rust toolchain — required to build the menubar app (Tauri)",
    binary: "cargo",
    installCmd: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
    fallbackCmd: process.platform === "darwin" ? "brew install rust" : undefined,
    fallbackNote: "Trying brew...",
  },
  {
    name: "Go",
    value: "go",
    description: "Go toolchain — optional, for Go-based MCP servers or tooling",
    binary: "go",
    installCmd: process.platform === "win32"
      ? "winget install GoLang.Go"
      : process.platform === "darwin"
        ? "brew install go"
        : "sudo apt install golang-go",
    fallbackCmd: process.platform === "linux" ? "sudo snap install go --classic" : undefined,
    fallbackNote: "Trying snap...",
  },
];

// ─── MCP server definitions ───────────────────────────────────────────────────

interface McpServer {
  name: string;
  description: string;
  envKey: string | null;
  type: "stdio" | "http";
  /** Static install command (stdio only). For MiniMax, command is built dynamically. */
  command?: string;
  /** HTTP endpoint URL (http type only) */
  url?: string;
  /** For MiniMax stdio servers: the MINIMAX_API_HOST value to inject via -e */
  minimaxHost?: string;
}

const MCP_SERVERS: Record<string, McpServer> = {
  "sequential-thinking": {
    name: "sequential-thinking",
    description: "Dynamic problem-solving through structured thought sequences",
    envKey: null,
    type: "stdio",
    command:
      "claude mcp add --scope user sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking",
  },
  minimax: {
    name: "MiniMax",
    description: "MiniMax coding plan MCP (international — api.minimax.io)",
    envKey: "MINIMAX_API_KEY",
    type: "stdio",
    minimaxHost: "https://api.minimax.io",
  },
  "minimax-cn": {
    name: "MiniMax-CN",
    description: "MiniMax CN coding plan MCP (mainland China — api.minimaxi.com)",
    envKey: "MINIMAX_CN_API_KEY",
    type: "stdio",
    minimaxHost: "https://api.minimaxi.com",
  },
  "web-reader": {
    name: "web-reader",
    description: "Z.AI/GLM web content reader",
    envKey: "Z_AI_API_KEY",
    type: "http",
    url: "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
  },
  "web-search-prime": {
    name: "web-search-prime",
    description: "Z.AI/GLM web search",
    envKey: "Z_AI_API_KEY",
    type: "http",
    url: "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
  },
  zread: {
    name: "zread",
    description: "Z.AI/GLM GitHub repository reader",
    envKey: "Z_AI_API_KEY",
    type: "http",
    url: "https://open.bigmodel.cn/api/mcp/zread/mcp",
  },
  "zai-mcp-server": {
    name: "zai-mcp-server",
    description: "Z.AI/GLM AI image/video/multimodal analysis",
    envKey: "Z_AI_API_KEY",
    type: "stdio",
    command: "", // built dynamically with -e Z_AI_API_KEY
  },
};

/**
 * Resolve Z.AI API key — accepts both Z_AI_API_KEY (new official name)
 * and ZHIPU_API_KEY (legacy name used on CN systems), preferring the new name.
 */
function getZaiKey(): string | undefined {
  return process.env.Z_AI_API_KEY ?? process.env.ZHIPU_API_KEY;
}

/**
 * Check if an MCP server is registered in ~/.claude.json (any scope).
 * `claude mcp list` only shows local-scope servers, so we read the config
 * file directly to catch user-scoped installations.
 */
function isMcpRegistered(serverName: string): boolean {
  try {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join: pathJoin } = require("node:path") as typeof import("node:path");
    const { homedir: homedirFn } = require("node:os") as typeof import("node:os");
    const raw = readFileSync(pathJoin(homedirFn(), ".claude.json"), "utf-8");
    const cfg = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    return !!cfg?.mcpServers?.[serverName];
  } catch {
    return false;
  }
}

/**
 * Build the `claude mcp add` command for MiniMax servers.
 * Injects MINIMAX_API_KEY and MINIMAX_API_HOST via -e flags so Claude Code
 * spawns the MCP subprocess with those env vars set correctly.
 */
function buildMinimaxCommand(mcpName: string, apiKey: string, apiHost: string): string {
  // Name MUST come before -e flags: claude CLI's -e is variadic and greedily
  // consumes subsequent tokens (including the server name) if placed after it.
  return `claude mcp add --scope user ${mcpName} -e MINIMAX_API_KEY=${apiKey} -e MINIMAX_API_HOST=${apiHost} -- uvx minimax-coding-plan-mcp -y`;
}

// ─── check-updates helpers ────────────────────────────────────────────────────

interface ToolVersion {
  name: string;
  installed: boolean;
  currentVersion?: string;
  latestVersion?: string;
  updateAvailable: boolean;
  installCommand: string;
}

function getToolVersion(command: string): string | undefined {
  try {
    const output = execSync(`${command} --version 2>&1 || ${command} -v 2>&1`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    }).trim();
    const versionMatch = output.match(/(\d+\.\d+\.?\d*)/);
    return versionMatch ? versionMatch[1] : output.split(/\s/)[0];
  } catch {
    return undefined;
  }
}

function getLatestNpmVersion(packageName: string): string | undefined {
  try {
    return execSync(`npm view ${packageName} version 2>/dev/null`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10000,
    }).trim();
  } catch {
    return undefined;
  }
}

function checkAllTools(): ToolVersion[] {
  const tools: ToolVersion[] = [];

  const opencodeInstalled = isInstalled("opencode");
  const opencodeVersion = opencodeInstalled ? getToolVersion("opencode") : undefined;
  const opencodeLatest = getLatestNpmVersion("opencode-ai");
  tools.push({
    name: "opencode",
    installed: opencodeInstalled,
    currentVersion: opencodeVersion,
    latestVersion: opencodeLatest,
    updateAvailable: opencodeInstalled && opencodeLatest !== undefined && opencodeVersion !== opencodeLatest,
    installCommand: getInstallCmd("opencode-ai"),
  });

  const codexInstalled = isInstalled("codex") || isInstalled("codex-cli");
  const codexVersion = codexInstalled ? (getToolVersion("codex") || getToolVersion("codex-cli")) : undefined;
  const codexLatest = getLatestNpmVersion("@openai/codex");
  tools.push({
    name: "codex",
    installed: codexInstalled,
    currentVersion: codexVersion,
    latestVersion: codexLatest,
    updateAvailable: codexInstalled && codexLatest !== undefined && codexVersion !== codexLatest,
    installCommand: getInstallCmd("@openai/codex"),
  });

  const ohmyInstalled = isInstalled("oh-my-opencode");
  const ohmyVersion = ohmyInstalled ? getToolVersion("oh-my-opencode") : undefined;
  const ohmyLatest = getLatestNpmVersion("oh-my-opencode");
  tools.push({
    name: "oh-my-opencode",
    installed: ohmyInstalled,
    currentVersion: ohmyVersion,
    latestVersion: ohmyLatest,
    updateAvailable: ohmyInstalled && ohmyLatest !== undefined && ohmyVersion !== ohmyLatest,
    installCommand: getInstallCmd("oh-my-opencode"),
  });

  return tools;
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerToolsCommand(program: Command) {
  const toolsCmd = program
    .command("tools")
    .description("Install and manage companion tools and MCP servers")
    .action(async () => {
      const { c, ok, dimText } = createFormatters();
      const { checkbox } = await import("@inquirer/prompts");

      console.log(`${c.bold}oh-my-claude Tools${c.reset}\n`);

      // Build combined choice list
      const cliChoices = CLI_TOOLS.map((tool) => {
        const installed = isInstalled(tool.binary);
        const label = installed
          ? `${tool.name} - ${tool.description} ${c.green}(installed)${c.reset}`
          : `${tool.name} - ${tool.description}`;
        return { name: label, value: `cli:${tool.value}` };
      });

      const mcpChoices = Object.values(MCP_SERVERS).map((server) => {
        const keyStatus = server.envKey
          ? (process.env[server.envKey] ? `${c.green}key set${c.reset}` : `${c.dim}${server.envKey} not set${c.reset}`)
          : `${c.green}no key needed${c.reset}`;
        return {
          name: `[MCP] ${server.name} - ${server.description} (${keyStatus})`,
          value: `mcp:${server.name}`,
        };
      });

      const selected = await checkbox({
        message: "Select tools and MCP servers to install",
        choices: [
          { name: "── CLI Tools ──", value: "__sep1__", disabled: true },
          ...cliChoices,
          { name: "── MCP Servers ──", value: "__sep2__", disabled: true },
          ...mcpChoices,
        ],
      });

      if (selected.length === 0) {
        console.log("\nNo items selected. Exiting.");
        return;
      }

      console.log();

      // Process CLI tools
      const cliSelected = selected.filter((v) => v.startsWith("cli:")).map((v) => v.slice(4));
      if (cliSelected.length > 0) {
        await installCliTools(cliSelected, { c, ok, dimText });
      }

      // Process MCP servers
      const mcpSelected = selected.filter((v) => v.startsWith("mcp:")).map((v) => v.slice(4));
      if (mcpSelected.length > 0) {
        await installMcpServers(mcpSelected);
      }
    });

  // ── tools install ────────────────────────────────────────────────────────
  toolsCmd
    .command("install [tool]")
    .description("Install external CLI tools (opencode, codex, oh-my-opencode, wezterm, tmux)")
    .option("--list", "List available tools without installing")
    .action(async (tool: string | undefined, options: { list?: boolean }) => {
      const { c, ok, fail, dimText, warn } = createFormatters();
      const pm = isBunAvailable() ? "bun" : "npm";

      if (pm === "bun") {
        console.log(dimText("Using bun as package manager\n"));
      }

      if (options.list) {
        console.log(`${c.bold}Available CLI tools:${c.reset}\n`);
        for (const t of CLI_TOOLS) {
          const installed = isInstalled(t.binary);
          const status = installed ? `${c.green}(installed)${c.reset}` : `${c.dim}(not installed)${c.reset}`;
          console.log(`  - ${c.cyan}${t.name}${c.reset} ${status}: ${t.description}`);
          console.log(`    ${c.dim}${resolveInstallCmd(t.installCmd)}${c.reset}`);
        }
        return;
      }

      // Direct install of named tool
      if (tool) {
        const match = CLI_TOOLS.find(
          (t) => t.value === tool || t.name.toLowerCase() === tool.toLowerCase()
        );
        if (!match) {
          console.log(fail(`Unknown tool: ${tool}`));
          console.log(dimText(`Available: ${CLI_TOOLS.map((t) => t.value).join(", ")}`));
          process.exit(1);
        }
        await installSingleCliTool(match, { c, ok, fail, dimText, warn });
        return;
      }

      // Interactive checkbox
      const { checkbox } = await import("@inquirer/prompts");
      console.log(`${c.bold}Install CLI Tools${c.reset}\n`);

      const choices = CLI_TOOLS.map((t) => {
        const installed = isInstalled(t.binary);
        const label = installed
          ? `${t.name} - ${t.description} ${c.green}(installed)${c.reset}`
          : `${t.name} - ${t.description}`;
        return { name: label, value: t.value };
      });

      const selected = await checkbox({ message: "Select tools to install", choices });

      if (selected.length === 0) {
        console.log("\nNo tools selected. Exiting.");
        return;
      }

      console.log();
      await installCliTools(selected, { c, ok, dimText });

      console.log();
      console.log(warn("You may need to restart your terminal for PATH changes to take effect."));
    });

  // ── tools mcp ────────────────────────────────────────────────────────────
  toolsCmd
    .command("mcp")
    .description("Install official MCP servers (sequential-thinking, MiniMax, Z.AI/GLM)")
    .option("--minimax", "Install MiniMax MCP only")
    .option("--glm", "Install Z.AI/GLM MCPs only")
    .option("--thinking", "Install Sequential Thinking MCP only")
    .option("--list", "List available MCP servers with env key status")
    .action(async (options: { minimax?: boolean; glm?: boolean; thinking?: boolean; list?: boolean }) => {
      const { c, ok, fail, warn, dimText } = createFormatters();
      const header = (text: string) => `${c.cyan}${c.bold}${text}${c.reset}`;

      if (options.list) {
        console.log(header("Available MCP Servers:\n"));

        const minimaxKey = process.env.MINIMAX_API_KEY;
        const minimaxCnKey = process.env.MINIMAX_CN_API_KEY;
        const zaiKey = getZaiKey();
        const zaiKeyLabel = process.env.Z_AI_API_KEY ? "Z_AI_API_KEY" : "ZHIPU_API_KEY";
        const keyStatus = (key: string | null | undefined, label: string) =>
          key ? `${c.green}configured${c.reset}` : `${c.dim}${label} not set${c.reset}`;

        console.log(`  ${c.bold}Anthropic Official:${c.reset}`);
        console.log(`    ${dimText("-")} sequential-thinking: ${MCP_SERVERS["sequential-thinking"]?.description ?? "N/A"}`);
        console.log(`      ${c.green}No API key required${c.reset}\n`);

        console.log(`  ${c.bold}MiniMax:${c.reset}`);
        console.log(`    ${dimText("-")} MiniMax (international): ${MCP_SERVERS["minimax"]?.description ?? "N/A"}`);
        console.log(`      MINIMAX_API_KEY:    ${keyStatus(minimaxKey, "MINIMAX_API_KEY")}`);
        console.log(`    ${dimText("-")} MiniMax-CN (China):      ${MCP_SERVERS["minimax-cn"]?.description ?? "N/A"}`);
        console.log(`      MINIMAX_CN_API_KEY: ${keyStatus(minimaxCnKey, "MINIMAX_CN_API_KEY")}\n`);

        console.log(`  ${c.bold}Z.AI/GLM:${c.reset}`);
        for (const server of Object.values(MCP_SERVERS)) {
          if (server.envKey === "Z_AI_API_KEY") {
            console.log(`    ${dimText("-")} ${server.name}: ${server.description}`);
          }
        }
        console.log(`      Z_AI_API_KEY / ZHIPU_API_KEY: ${keyStatus(zaiKey, zaiKeyLabel)}`);
        return;
      }

      const hasFlag = options.minimax || options.glm || options.thinking;
      const installThinking = options.thinking || !hasFlag;
      const installMinimax = options.minimax || !hasFlag;
      const installGlm = options.glm || !hasFlag;

      // If no flags, show interactive checkbox
      if (!hasFlag) {
        const { checkbox } = await import("@inquirer/prompts");
        const mcpChoices = Object.values(MCP_SERVERS).map((server) => {
          const isZai = server.envKey === "Z_AI_API_KEY";
          const hasKey = isZai ? !!getZaiKey() : (server.envKey ? !!process.env[server.envKey] : true);
          const keyLabel = isZai ? "Z_AI_API_KEY / ZHIPU_API_KEY" : server.envKey;
          const keyStatus = server.envKey
            ? (hasKey ? `${c.green}key set${c.reset}` : `${c.dim}${keyLabel} not set${c.reset}`)
            : `${c.green}no key needed${c.reset}`;
          return {
            name: `${server.name} - ${server.description} (${keyStatus})`,
            value: server.name,
          };
        });

        const selected = await checkbox({ message: "Select MCP servers to install", choices: mcpChoices });
        if (selected.length === 0) {
          console.log("\nNo servers selected. Exiting.");
          return;
        }
        console.log();
        await installSelectedMcps(selected, { ok, fail, warn, dimText, c });
        return;
      }

      // Flag-based install
      console.log(header("Setting up official MCP servers...\n"));
      let hasErrors = false;

      if (installThinking) {
        console.log(`${c.bold}Anthropic Official:${c.reset}`);
        try {
          if (isMcpRegistered("sequential-thinking")) {
            console.log(`  ${ok("sequential-thinking already installed")}`);
          } else {
            execSync(MCP_SERVERS["sequential-thinking"]!.command!, { stdio: "pipe" });
            console.log(`  ${ok("sequential-thinking installed")}`);
          }
        } catch {
          console.log(`  ${fail("Failed to install sequential-thinking")}`);
          hasErrors = true;
        }
      }

      if (installMinimax) {
        console.log(`\n${c.bold}MiniMax:${c.reset}`);
        const minimaxKey = process.env.MINIMAX_API_KEY;
        const minimaxCnKey = process.env.MINIMAX_CN_API_KEY;

        if (!minimaxKey && !minimaxCnKey) {
          console.log(`  ${warn("Neither MINIMAX_API_KEY nor MINIMAX_CN_API_KEY is set — skipping MiniMax")}`);
          console.log(`    ${dimText("export MINIMAX_API_KEY=your-key      # international (api.minimax.io)")}`);
          console.log(`    ${dimText("export MINIMAX_CN_API_KEY=your-key   # mainland China (api.minimaxi.com)")}`);
        } else {
          if (minimaxKey) {
            try {
              if (isMcpRegistered("MiniMax")) {
                console.log(`  ${ok("MiniMax (international) already installed")}`);
              } else {
                const cmd = buildMinimaxCommand("MiniMax", minimaxKey, "https://api.minimax.io");
                execSync(cmd, { stdio: "inherit" });
                console.log(`  ${ok("MiniMax (international) installed")}`);
              }
            } catch {
              console.log(`  ${fail("Failed to install MiniMax (international)")}`);
              hasErrors = true;
            }
          }

          if (minimaxCnKey) {
            try {
              if (isMcpRegistered("MiniMax-CN")) {
                console.log(`  ${ok("MiniMax-CN already installed")}`);
              } else {
                const cmd = buildMinimaxCommand("MiniMax-CN", minimaxCnKey, "https://api.minimaxi.com");
                execSync(cmd, { stdio: "inherit" });
                console.log(`  ${ok("MiniMax-CN installed")}`);
              }
            } catch {
              console.log(`  ${fail("Failed to install MiniMax-CN")}`);
              hasErrors = true;
            }
          }
        }
      }

      if (installGlm) {
        console.log(`\n${c.bold}Z.AI/GLM:${c.reset}`);
        const zaiKey = getZaiKey();
        if (!zaiKey) {
          console.log(`  ${warn("Z_AI_API_KEY (or ZHIPU_API_KEY) not set - skipping Z.AI/GLM MCPs")}`);
          console.log(`    ${dimText("Set it with: export Z_AI_API_KEY=your-key")}`);
        } else {
          const glmServers = Object.values(MCP_SERVERS).filter((s) => s.envKey === "Z_AI_API_KEY");
          for (const server of glmServers) {
            try {
              if (isMcpRegistered(server.name)) {
                console.log(`  ${ok(`${server.name} already installed`)}`);
              } else {
                let cmd: string;
                if (server.name === "zai-mcp-server") {
                  cmd = `claude mcp add --scope user zai-mcp-server -e Z_AI_API_KEY=${zaiKey} -e Z_AI_MODE=ZHIPU -- npx -y "@z_ai/mcp-server"`;
                } else {
                  cmd = `claude mcp add --scope user --transport http ${server.name} ${server.url!} --header "Authorization: Bearer ${zaiKey}"`;
                }
                execSync(cmd, { stdio: "pipe" });
                console.log(`  ${ok(`${server.name} installed`)}`);
              }
            } catch {
              console.log(`  ${fail(`Failed to install ${server.name}`)}`);
              hasErrors = true;
            }
          }
        }
      }

      console.log();
      if (hasErrors) {
        console.log(warn("Setup completed with some errors"));
        process.exit(1);
      } else {
        console.log(ok("MCP servers setup complete!"));
        console.log(`\n${dimText("Restart Claude Code to activate the new MCP servers.")}`);
      }
    });

  // ── tools check ──────────────────────────────────────────────────────────
  toolsCmd
    .command("check")
    .description("Check for updates to CLI tools")
    .option("--auto", "Auto-upgrade outdated tools without prompting")
    .option("--json", "Output results as JSON")
    .action(async (options: { auto?: boolean; json?: boolean }) => {
      const { c, ok, fail, warn, dimText } = createFormatters();

      console.log(`${c.bold}${c.cyan}Checking for updates...${c.reset}\n`);

      const tools = checkAllTools();

      if (options.json) {
        console.log(JSON.stringify(tools, null, 2));
        return;
      }

      let hasUpdates = false;
      const updatesToApply: ToolVersion[] = [];

      for (const tool of tools) {
        if (!tool.installed) {
          console.log(`${dimText(`○ ${tool.name}: not installed`)}`);
          console.log(`  ${dimText(`Install: oh-my-claude tools install ${tool.name}`)}`);
          console.log();
        } else if (tool.updateAvailable) {
          hasUpdates = true;
          console.log(`${warn(`${tool.name}: update available`)}`);
          console.log(`  ${dimText(`Current:  ${tool.currentVersion}`)}`);
          console.log(`  ${ok(`Latest:   ${tool.latestVersion}`)}`);
          console.log();
          updatesToApply.push(tool);
        } else {
          console.log(`${ok(`${tool.name}: up to date`)}`);
          if (tool.currentVersion) {
            console.log(`  ${dimText(`Version: ${tool.currentVersion}`)}`);
          }
          console.log();
        }
      }

      if (!hasUpdates) {
        console.log(`${ok("All tools are up to date! ✓")}`);
        return;
      }

      if (options.auto) {
        console.log(`${c.bold}Auto-upgrading...${c.reset}\n`);
        for (const tool of updatesToApply) {
          console.log(`${dimText(`Updating ${tool.name}...`)}`);
          try {
            execSync(tool.installCommand, { stdio: "inherit", timeout: 120000 });
            console.log(`${ok(`${tool.name} updated successfully`)}\n`);
          } catch {
            console.log(`${fail(`${tool.name} update failed`)}\n`);
          }
        }
      } else {
        console.log(`${c.bold}Run with --auto to upgrade all tools${c.reset}`);
        console.log(`${dimText("Or run oh-my-claude tools install to install missing tools")}`);
      }
    });
}

// ─── Install helpers ──────────────────────────────────────────────────────────

type Fmts = ReturnType<typeof createFormatters>;

async function installSingleCliTool(
  tool: CliTool,
  fmts: { c: Fmts["c"]; ok: Fmts["ok"]; fail: Fmts["fail"]; dimText: Fmts["dimText"]; warn: Fmts["warn"] },
) {
  const { c, ok, fail, dimText, warn } = fmts;
  const { confirm } = await import("@inquirer/prompts");

  if (isInstalled(tool.binary)) {
    const reinstall = await confirm({
      message: `${tool.name} is already installed. Reinstall?`,
      default: false,
    });
    if (!reinstall) {
      console.log(dimText(`Skipping ${tool.name}.`));
      return;
    }
  }

  // UI UX Pro Max needs Python
  if (tool.value === "uipro") {
    let hasPython = false;
    try {
      execSync("python3 --version", { stdio: "pipe" });
      hasPython = true;
    } catch {
      try {
        execSync("python --version", { stdio: "pipe" });
        hasPython = true;
      } catch { /* no python */ }
    }
    if (!hasPython) {
      console.log(fail("Python 3 is required for UI UX Pro Max"));
      console.log(dimText("Install Python 3 from https://python.org/ and try again."));
      return;
    }
  }

  const installCmd = resolveInstallCmd(tool.installCmd);
  console.log(`Installing ${tool.name}...`);
  try {
    execSync(installCmd, { stdio: "inherit", timeout: 120000 });
    console.log(ok(`${tool.name} installed`));

    // UI UX Pro Max: post-install init
    if (tool.value === "uipro") {
      console.log("Initializing UI UX Pro Max for Claude Code...");
      try {
        execSync("npx uipro-cli init --ai claude", { stdio: "inherit", timeout: 60000, cwd: homedir() });
        console.log(ok("UI UX Pro Max initialized for Claude Code"));
        console.log(dimText("Skills installed to ~/.claude/skills/ui-ux-pro-max/"));
      } catch {
        console.log(fail("Failed to initialize UI UX Pro Max"));
        console.log(dimText("Try manually: npx uipro-cli init --ai claude"));
      }
    }

    // OpenCode: offer oh-my-opencode companion
    if (tool.value === "opencode") {
      const ohmyInstalled = isInstalled("oh-my-opencode");
      if (!ohmyInstalled) {
        const installCompanion = await confirm({
          message: "Also install oh-my-opencode companion? (multi-provider plugin for OpenCode)",
          default: true,
        });
        if (installCompanion) {
          console.log("Installing oh-my-opencode...");
          try {
            execSync(resolveInstallCmd("npm install -g oh-my-opencode"), { stdio: "inherit", timeout: 120000 });
            console.log(ok("oh-my-opencode installed"));
          } catch {
            console.log(fail("Failed to install oh-my-opencode"));
            console.log(dimText("Try manually: npm install -g oh-my-opencode"));
          }
        }
      }
    }
  } catch {
    if (tool.fallbackCmd) {
      console.log(dimText(tool.fallbackNote ?? "Trying fallback..."));
      try {
        execSync(tool.fallbackCmd, { stdio: "inherit", timeout: 120000 });
        console.log(ok(`${tool.name} installed via fallback`));
      } catch {
        console.log(fail(`Failed to install ${tool.name}`));
        console.log(dimText(`Try manually: ${installCmd}`));
        if (tool.fallbackCmd) console.log(dimText(`Or: ${tool.fallbackCmd}`));
      }
    } else {
      console.log(fail(`Failed to install ${tool.name}`));
      console.log(dimText(`Try manually: ${installCmd}`));
    }
  }
}

async function installCliTools(
  selected: string[],
  fmts: { c: Fmts["c"]; ok: Fmts["ok"]; dimText: Fmts["dimText"] },
) {
  const allFmts = createFormatters();
  const merged = { ...allFmts, ...fmts };
  for (const toolValue of selected) {
    const tool = CLI_TOOLS.find((t) => t.value === toolValue);
    if (!tool) continue;
    await installSingleCliTool(tool, merged);
    console.log();
  }
}

async function installSelectedMcps(
  selected: string[],
  fmts: { ok: Fmts["ok"]; fail: Fmts["fail"]; warn: Fmts["warn"]; dimText: Fmts["dimText"]; c: Fmts["c"] },
) {
  const { ok, fail, warn, dimText } = fmts;
  let hasErrors = false;

  for (const name of selected) {
    const server = Object.values(MCP_SERVERS).find((s) => s.name === name);
    if (!server) continue;

    // For Z.AI servers, accept either Z_AI_API_KEY or ZHIPU_API_KEY
    const isZaiServer = server.envKey === "Z_AI_API_KEY";
    const resolvedKey = isZaiServer ? getZaiKey() : (server.envKey ? process.env[server.envKey] : undefined);
    if (server.envKey && !resolvedKey) {
      const keyHint = isZaiServer ? "Z_AI_API_KEY (or ZHIPU_API_KEY)" : server.envKey;
      console.log(`${warn(`${server.name}: ${keyHint} not set - skipping`)}`);
      console.log(`  ${dimText(`Set it with: export Z_AI_API_KEY=your-key`)}`);
      continue;
    }

    try {
      if (isMcpRegistered(server.name)) {
        console.log(`${ok(`${server.name} already installed`)}`);
        continue;
      }

      if (server.minimaxHost) {
        // MiniMax stdio — build command with -e env injection
        const apiKey = process.env[server.envKey!]!;
        const host = process.env.MINIMAX_API_HOST ?? server.minimaxHost;
        const cmd = buildMinimaxCommand(server.name, apiKey, host);
        execSync(cmd, { stdio: "pipe" });
      } else if (server.name === "zai-mcp-server") {
        // Z.AI stdio server — needs -e env injection + Z_AI_MODE=ZHIPU
        const cmd = `claude mcp add --scope user zai-mcp-server -e Z_AI_API_KEY=${resolvedKey} -e Z_AI_MODE=ZHIPU -- npx -y "@z_ai/mcp-server"`;
        execSync(cmd, { stdio: "pipe" });
      } else if (server.type === "stdio" && server.command) {
        execSync(server.command, { stdio: "pipe" });
      } else if (server.type === "http" && server.url) {
        const cmd = `claude mcp add --scope user --transport http ${server.name} ${server.url} --header "Authorization: Bearer ${resolvedKey}"`;
        execSync(cmd, { stdio: "pipe" });
      }
      console.log(`${ok(`${server.name} installed`)}`);
    } catch {
      console.log(`${fail(`Failed to install ${server.name}`)}`);
      hasErrors = true;
    }
  }

  console.log();
  if (hasErrors) {
    console.log(warn("Setup completed with some errors"));
  } else {
    console.log(ok("MCP servers setup complete!"));
    console.log(`\n${dimText("Restart Claude Code to activate the new MCP servers.")}`);
  }
}

async function installMcpServers(names: string[]) {
  await installSelectedMcps(names, createFormatters());
}
