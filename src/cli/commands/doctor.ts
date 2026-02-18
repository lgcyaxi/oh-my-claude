/**
 * Doctor command — diagnose oh-my-claude configuration
 *
 * Extracted from cli.ts. Checks installation, version, agents, commands,
 * MCP server, hooks, statusline, companion tools, providers, configuration,
 * memory system, and provides fix-mem repair functionality.
 */

import type { Command } from "commander";
import { createFormatters } from "../utils/colors";
import { INSTALL_DIR, SETTINGS_PATH } from "../utils/paths";
import { checkInstallation } from "../../installer";
import { getProvidersStatus } from "../../providers/router";
import { loadConfig } from "../../config";
import { existsSync, readFileSync, readdirSync, statSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

export function registerDoctorCommand(program: Command) {
  program
    .command("doctor")
    .description("Diagnose oh-my-claude configuration")
    .option("--detail", "Show detailed status of each component")
    .option("--fix-mem", "Fix memory system issues (copy WASM, rebuild index)")
    .option("--no-color", "Disable colored output")
    .action(async (options) => {
      const { isBetaInstallation, getBetaChannelInfo, checkForNewerBeta } = require("../../installer/beta-channel");

      const detail = options.detail;
      const useColor = options.color !== false && process.stdout.isTTY;

      const { c, ok, fail, warn, header, subheader, dimText } = createFormatters(useColor);

      console.log(`${c.bold}${c.magenta}oh-my-claude Doctor${c.reset}\n`);

      // Check installation
      const status = checkInstallation();
      console.log(header("Installation:"));
      console.log(`  ${status.installed ? ok("Core files installed") : fail("Core files installed")}`);
      console.log(`  ${status.components.agents ? ok("Agent files generated") : fail("Agent files generated")}`);
      console.log(`  ${status.components.hooks ? ok("Hooks configured") : fail("Hooks configured")}`);
      console.log(`  ${status.components.mcp ? ok("MCP server configured") : fail("MCP server configured")}`);
      console.log(`  ${status.components.statusLine ? ok("StatusLine configured") : warn("StatusLine not configured")}`);
      console.log(`  ${status.components.config ? ok("Configuration file exists") : fail("Configuration file exists")}`);

      // Version and Channel info
      console.log(`\n${header("Version:")}`);
      let currentVersion = "unknown";
      try {
        const localPkgPath = join(INSTALL_DIR, "package.json");
        if (existsSync(localPkgPath)) {
          const pkg = JSON.parse(readFileSync(localPkgPath, "utf-8"));
          currentVersion = pkg.version;
        }
      } catch {
        // Ignore
      }

      const betaInfo = getBetaChannelInfo();
      const isOnBeta = isBetaInstallation();

      if (isOnBeta && betaInfo) {
        console.log(`  ${ok(`Current: ${currentVersion}`)} ${c.yellow}(beta)${c.reset}`);
        console.log(`  ${dimText(`Channel: beta (${betaInfo.branch} @ ${betaInfo.ref.substring(0, 7)})`)}`);
        console.log(`  ${dimText(`Installed: ${new Date(betaInfo.installedAt).toLocaleDateString()}`)}`);
      } else {
        console.log(`  ${ok(`Current: ${currentVersion}`)} ${c.green}(stable)${c.reset}`);
        console.log(`  ${dimText("Channel: npm (@lgcyaxi/oh-my-claude)")}`);
      }

      // Detailed agent status
      if (detail) {
        console.log(`\n${header("Agents (detailed):")}`);
        const agentsDir = join(homedir(), ".claude", "agents");
        const expectedAgents = [
          "sisyphus",
          "claude-reviewer",
          "claude-scout",
          "prometheus",
          "oracle",
          "analyst",
          "librarian",
          "frontend-ui-ux",
          "document-writer",
          "navigator",
          "hephaestus",
        ];
        for (const agent of expectedAgents) {
          const agentPath = join(agentsDir, `${agent}.md`);
          const exists = existsSync(agentPath);
          console.log(`  ${exists ? ok(`${agent}.md`) : fail(`${agent}.md`)}`);
        }

        // Detailed command status
        console.log(`\n${header("Commands (detailed):")}`);
        const commandsDir = join(homedir(), ".claude", "commands");
        const expectedCommands = [
          // Agent commands
          "omc-sisyphus",
          "omc-oracle",
          "omc-librarian",
          "omc-reviewer",
          "omc-scout",
          "omc-explore",
          "omc-plan",
          "omc-start-work",
          "omc-status",
          "omc-switch",
          "omc-ulw",
          "omc-hephaestus",
          // Memory commands
          "omc-mem-compact",
          "omc-mem-clear",
          "omc-mem-summary",
          // Quick action commands
          "omcx-commit",
          "omcx-implement",
          "omcx-refactor",
          "omcx-docs",
          "omcx-issue",
        ];
        console.log(`  ${subheader("Agent commands (omc-):")}`);
        for (const cmd of expectedCommands.filter(c => c.startsWith("omc-") && !c.startsWith("omc-mem-"))) {
          const cmdPath = join(commandsDir, `${cmd}.md`);
          const exists = existsSync(cmdPath);
          console.log(`    ${exists ? ok(`/${cmd}`) : fail(`/${cmd}`)}`);
        }
        console.log(`  ${subheader("Memory commands (omc-mem-):")}`);
        for (const cmd of expectedCommands.filter(c => c.startsWith("omc-mem-"))) {
          const cmdPath = join(commandsDir, `${cmd}.md`);
          const exists = existsSync(cmdPath);
          console.log(`    ${exists ? ok(`/${cmd}`) : fail(`/${cmd}`)}`);
        }
        console.log(`  ${subheader("Quick action commands (omcx-):")}`);
        for (const cmd of expectedCommands.filter(c => c.startsWith("omcx-"))) {
          const cmdPath = join(commandsDir, `${cmd}.md`);
          const exists = existsSync(cmdPath);
          console.log(`    ${exists ? ok(`/${cmd}`) : fail(`/${cmd}`)}`);
        }

        // Detailed MCP status
        console.log(`\n${header("MCP Server (detailed):")}`);
        try {
          const mcpList = execSync("claude mcp list", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
          const omcLine = mcpList.split("\n").find((line: string) => line.includes("oh-my-claude-background"));
          if (omcLine) {
            const isConnected = omcLine.includes("✓ Connected");
            console.log(`  ${isConnected ? ok("oh-my-claude-background") : fail("oh-my-claude-background")}`);
            console.log(`    Status: ${isConnected ? `${c.green}Connected${c.reset}` : `${c.red}Not connected${c.reset}`}`);
            // Extract path from the line (format: "name: node /path/to/file - status")
            const pathMatch = omcLine.match(/node\s+(.+?)\s+-/);
            if (pathMatch) {
              const serverPath = pathMatch[1]!.trim();
              console.log(`    Path: ${dimText(serverPath)}`);
              const fileExists = existsSync(serverPath);
              console.log(`    File exists: ${fileExists ? `${c.green}Yes${c.reset}` : `${c.red}No${c.reset}`}`);
            }
          } else {
            console.log(`  ${fail("oh-my-claude-background not registered")}`);
            console.log(`    ${dimText("Run 'oh-my-claude install' to register MCP server")}`);
          }
        } catch (error) {
          console.log(`  ${fail("Failed to check MCP status")}`);
          console.log(`    ${dimText("Make sure 'claude' CLI is available")}`);
        }

        // Hooks detail
        console.log(`\n${header("Hooks (detailed):")}`);
        const hooksDir = join(INSTALL_DIR, "hooks");
        const expectedHooks = ["comment-checker.js", "todo-continuation.js", "task-notification.js"];
        for (const hook of expectedHooks) {
          const hookPath = join(hooksDir, hook);
          const exists = existsSync(hookPath);
          console.log(`  ${exists ? ok(hook) : fail(hook)}`);
        }

        // StatusLine detail with validation
        console.log(`\n${header("StatusLine (detailed):")}`);

        try {
          const { validateStatusLineSetup } = require("../../installer/statusline-merger");
          const validation = validateStatusLineSetup();

          // Script existence
          console.log(`  ${validation.details.scriptExists ? ok("statusline.js installed") : fail("statusline.js not installed")}`);

          // Node path (relevant on Windows)
          if (process.platform === "win32") {
            console.log(`  ${validation.details.nodePathValid ? ok("Node.js path valid") : fail("Node.js path invalid")}`);
          }

          // Settings.json configuration
          console.log(`  ${validation.details.settingsConfigured ? ok("StatusLine configured in settings.json") : warn("StatusLine not configured in settings.json")}`);

          // Settings mode detection
          if (existsSync(SETTINGS_PATH)) {
            const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
            if (settings.statusLine) {
              const cmd = settings.statusLine.command || "";
              const isWrapper = cmd.includes("statusline-wrapper");
              const isOurs = cmd.includes("oh-my-claude");
              if (isWrapper) {
                console.log(`    Mode: ${c.yellow}Merged (wrapper)${c.reset}`);
              } else if (isOurs) {
                console.log(`    Mode: ${c.green}Direct${c.reset}`);
              } else {
                console.log(`    Mode: ${c.cyan}External${c.reset}`);
              }
            }
          }

          // Command execution test
          console.log(`  ${validation.details.commandWorks ? ok("StatusLine command works") : fail("StatusLine command failed")}`);

          // Config file check
          const configDir = join(homedir(), ".config", "oh-my-claude");
          const configPath = join(configDir, "statusline.json");
          const configExists = existsSync(configPath);
          console.log(`  ${configExists ? ok("StatusLine config exists") : warn("StatusLine config not found")}`);
          if (configExists) {
            console.log(`    Path: ${dimText(configPath)}`);
          } else {
            console.log(`    ${dimText(`Expected: ${configPath}`)}`);
          }

          // Show any warnings
          if (validation.warnings.length > 0) {
            console.log(`\n  ${subheader("Warnings:")}`);
            for (const w of validation.warnings) {
              console.log(`    ${warn(w)}`);
            }
          }

          // Show any errors
          if (validation.errors.length > 0) {
            console.log(`\n  ${subheader("Errors:")}`);
            for (const e of validation.errors) {
              console.log(`    ${fail(e)}`);
            }
          }

          // Overall status
          console.log(`\n  Overall: ${validation.valid ? `${c.green}✓ Healthy${c.reset}` : `${c.red}✗ Issues detected${c.reset}`}`);
        } catch (error) {
          console.log(`  ${fail("Failed to validate StatusLine:")} ${error}`);
        }
      }

      // Check companion tools
      if (detail) {
        console.log(`\n${header("Companion Tools:")}`);

        // Check UI UX Pro Max
        const skillDir = join(homedir(), ".claude", "skills", "ui-ux-pro-max");
        const skillExists = existsSync(skillDir);
        console.log(`  ${skillExists ? ok("UI UX Pro Max skill") : dimText("○ UI UX Pro Max (not installed)")}`);
        if (skillExists) {
          const skillMd = join(skillDir, "SKILL.md");
          console.log(`    Path: ${dimText(skillDir)}`);
          console.log(`    SKILL.md: ${existsSync(skillMd) ? `${c.green}found${c.reset}` : `${c.red}missing${c.reset}`}`);
        }

        // Check CCometixLine
        let cclineInstalled = false;
        try {
          execSync(process.platform === "win32" ? "where ccline" : "which ccline", { stdio: "pipe" });
          cclineInstalled = true;
        } catch { /* not installed */ }
        console.log(`  ${cclineInstalled ? ok("CCometixLine") : dimText("○ CCometixLine (not installed)")}`);

        // Check OpenCode CLI
        let opencodeInstalled = false;
        try {
          execSync(process.platform === "win32" ? "where opencode" : "which opencode", { stdio: "pipe" });
          opencodeInstalled = true;
        } catch { /* not installed */ }
        console.log(`  ${opencodeInstalled ? ok("OpenCode CLI") : dimText("○ OpenCode CLI (not installed)")}`);
        if (!opencodeInstalled) {
          console.log(`    ${dimText("Install: npm install -g opencode-ai")}`);
        }

        // Check Codex CLI
        let codexInstalled = false;
        try {
          execSync(process.platform === "win32" ? "where codex" : "which codex", { stdio: "pipe" });
          codexInstalled = true;
        } catch { /* not installed */ }
        console.log(`  ${codexInstalled ? ok("Codex CLI") : dimText("○ Codex CLI (not installed)")}`);
        if (!codexInstalled) {
          console.log(`    ${dimText("Install: npm install -g @openai/codex")}`);
        }

        // Check oh-my-opencode
        let ohmyopencodeInstalled = false;
        try {
          execSync(process.platform === "win32" ? "where oh-my-opencode" : "which oh-my-opencode", { stdio: "pipe" });
          ohmyopencodeInstalled = true;
        } catch { /* not installed */ }
        console.log(`  ${ohmyopencodeInstalled ? ok("oh-my-opencode") : dimText("○ oh-my-opencode (not installed)")}`);
        if (!ohmyopencodeInstalled) {
          console.log(`    ${dimText("Install: npm install -g oh-my-opencode")}`);
        }

        // Check WezTerm
        let weztermInstalled = false;
        try {
          execSync(process.platform === "win32" ? "where wezterm" : "which wezterm", { stdio: "pipe" });
          weztermInstalled = true;
        } catch { /* not installed */ }
        console.log(`  ${weztermInstalled ? ok("WezTerm") : dimText("○ WezTerm (not installed)")}`);
        if (!weztermInstalled) {
          if (process.platform === "win32") {
            console.log(`    ${dimText("Install: winget install wez.wezterm")}`);
          } else if (process.platform === "darwin") {
            console.log(`    ${dimText("Install: brew install --cask wezterm")}`);
          } else {
            console.log(`    ${dimText("Install: https://wezfurlong.org/wezterm/installation")}`);
          }
        }

        // Check tmux
        let tmuxInstalled = false;
        try {
          execSync(process.platform === "win32" ? "where tmux" : "which tmux", { stdio: "pipe" });
          tmuxInstalled = true;
        } catch { /* not installed */ }
        console.log(`  ${tmuxInstalled ? ok("tmux") : dimText("○ tmux (not installed)")}`);
        if (!tmuxInstalled) {
          if (process.platform === "win32") {
            console.log(`    ${dimText("Not available on Windows")}`);
          } else if (process.platform === "darwin") {
            console.log(`    ${dimText("Install: brew install tmux")}`);
          } else {
            console.log(`    ${dimText("Install: sudo apt install tmux or sudo pacman -S tmux")}`);
          }
        }

        // Check output styles
        const stylesDir = join(homedir(), ".claude", "output-styles");
        const stylesExist = existsSync(stylesDir);
        if (stylesExist) {
          const styleCount = readdirSync(stylesDir).filter((f: string) => f.endsWith(".md")).length;
          console.log(`  ${ok(`Output styles: ${styleCount} style(s)`)}`);
        } else {
          console.log(`  ${dimText("○ Output styles (not deployed)")}`);
        }
      }

      // Check providers
      console.log(`\n${header("Providers:")}`);
      try {
        const providers = getProvidersStatus();
        for (const [name, info] of Object.entries(providers)) {
          const isOAuth = info.type === "openai-oauth";
          const note = info.type === "claude-subscription"
            ? dimText("(uses Claude subscription)")
            : isOAuth
              ? dimText(`(OAuth — run 'oh-my-claude auth login ${name}')`)
              : "";
          console.log(`  ${info.configured ? ok(name) : fail(name)} ${note}`);
          if (detail && info.type !== "claude-subscription" && !isOAuth) {
            const envVar = `${name.toUpperCase()}_API_KEY`;
            const isSet = process.env[envVar];
            console.log(`    Env: ${c.cyan}${envVar}${c.reset} ${isSet ? `${c.green}(set)${c.reset}` : `${c.red}(not set)${c.reset}`}`);
          }
        }
      } catch (error) {
        console.log(`  ${fail("Failed to check providers:")} ${error}`);
      }

      // OAuth credentials check
      console.log(`\n${header("OAuth Credentials:")}`);
      try {
        const { listCredentials } = require("../../auth/store");
        const { hasMiniMaxCredential } = require("../../auth/minimax");
        const { hasKimiCredential } = require("../../auth/kimi");
        const creds = listCredentials() as Array<{ provider: string; type: string; detail: string }>;
        const hasMiniMax = hasMiniMaxCredential();
        const hasKimi = hasKimiCredential();

        if (creds.length === 0 && !hasMiniMax && !hasKimi) {
          console.log(`  ${dimText("No OAuth providers authenticated.")}`);
          console.log(`  ${dimText("Run: oh-my-claude auth login <openai|kimi|minimax>")}`);
        } else {
          for (const entry of creds) {
            console.log(`  ${ok(`${c.cyan}${entry.provider}${c.reset} — ${entry.detail}`)}`);
          }
          if (hasMiniMax) {
            console.log(`  ${ok(`${c.cyan}minimax${c.reset} — quota display`)}`);
          }
          if (hasKimi) {
            console.log(`  ${ok(`${c.cyan}kimi${c.reset} — quota display`)}`);
          }
        }
      } catch {
        console.log(`  ${dimText("Auth module not available (install required)")}`);
      }

      // Check configuration
      console.log(`\n${header("Configuration:")}`);
      try {
        const config = loadConfig();
        console.log(`  ${ok("Configuration loaded")}`);
        console.log(`  ${dimText("-")} ${Object.keys(config.agents).length} agents configured`);
        console.log(`  ${dimText("-")} ${Object.keys(config.categories).length} categories configured`);

        if (detail) {
          // Separate Task tool agents (Claude subscription) from MCP agents (external APIs)
          const taskToolAgents: [string, any][] = [];
          const mcpAgents: [string, any][] = [];

          for (const [name, agentConfig] of Object.entries(config.agents)) {
            const provider = (agentConfig as any).provider;
            const providerConfig = config.providers[provider];
            if (providerConfig?.type === "claude-subscription") {
              taskToolAgents.push([name, agentConfig]);
            } else {
              mcpAgents.push([name, agentConfig]);
            }
          }

          if (taskToolAgents.length > 0) {
            console.log(`\n  ${subheader("Task tool agents:")} ${c.dim}(model managed by Claude Code)${c.reset}`);
            for (const [name] of taskToolAgents) {
              console.log(`    ${dimText("-")} ${c.bold}${name}${c.reset}`);
            }
          }

          if (mcpAgents.length > 0) {
            console.log(`\n  ${subheader("MCP background agents:")}`);
            for (const [name, agentConfig] of mcpAgents) {
              console.log(`    ${dimText("-")} ${c.bold}${name}${c.reset}: ${c.cyan}${(agentConfig as any).provider}${c.reset}/${c.blue}${(agentConfig as any).model}${c.reset}`);
            }
          }
        }
      } catch (error) {
        console.log(`  ${fail("Failed to load configuration:")} ${error}`);
      }

      // Find project root by walking up from cwd (used by memory checks and fix-mem)
      let doctorProjectRoot: string | null = null;
      {
        let dir = process.cwd();
        // On MSYS/Git Bash, try resolving via git to get the canonical path
        try {
          const gitRoot = execSync("git rev-parse --show-toplevel", {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
            cwd: dir,
          }).trim();
          if (gitRoot && existsSync(gitRoot)) {
            doctorProjectRoot = gitRoot;
          }
        } catch {
          // Not in a git repo or git not available — fall back to manual walk
        }

        if (!doctorProjectRoot) {
          while (true) {
            if (existsSync(join(dir, ".git"))) { doctorProjectRoot = dir; break; }
            // Also check for .claude/mem as a project indicator
            if (existsSync(join(dir, ".claude", "mem"))) { doctorProjectRoot = dir; break; }
            const parent = dirname(dir);
            if (parent === dir) break;
            dir = parent;
          }
        }
      }

      // Memory System health check
      console.log(`\n${header("Memory System:")}`);
      try {
        const globalMemDir = join(homedir(), ".claude", "oh-my-claude", "memory");
        const projectMemDir = doctorProjectRoot ? join(doctorProjectRoot, ".claude", "mem") : null;
        const indexDbPath = join(globalMemDir, "index.db");
        const indexDbExists = existsSync(indexDbPath);

        // Check WASM file (required for SQLite indexer)
        const wasmPath = join(INSTALL_DIR, "mcp", "sql-wasm.wasm");
        const wasmExists = existsSync(wasmPath);

        // Count memory files
        let globalNotes = 0, globalSessions = 0;
        let projectNotes = 0, projectSessions = 0;
        const countMdFiles = (dir: string) => {
          try {
            return existsSync(dir) ? readdirSync(dir).filter((f: string) => f.endsWith(".md")).length : 0;
          } catch { return 0; }
        };

        globalNotes = countMdFiles(join(globalMemDir, "notes"));
        globalSessions = countMdFiles(join(globalMemDir, "sessions"));
        if (projectMemDir) {
          projectNotes = countMdFiles(join(projectMemDir, "notes"));
          projectSessions = countMdFiles(join(projectMemDir, "sessions"));
        }
        const totalFiles = globalNotes + globalSessions + projectNotes + projectSessions;

        // Determine embedding provider from config
        const memConfig = loadConfig();
        const embeddingProvider = memConfig.memory?.embedding?.provider ?? "custom";
        const embeddingModel = memConfig.memory?.embedding?.model ?? "embedding-3";

        // Check embedding provider availability
        let embeddingAvailable = false;
        let embeddingDetail = "";
        switch (embeddingProvider) {
          case "custom": {
            const apiBase = process.env.EMBEDDING_API_BASE;
            const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
            embeddingAvailable = !!apiBase && apiBase.length > 0;
            embeddingDetail = embeddingAvailable
              ? `custom (${model} @ ${apiBase})`
              : "custom (EMBEDDING_API_BASE not set)";
            break;
          }
          case "zhipu": {
            embeddingAvailable = !!process.env.ZHIPU_API_KEY;
            embeddingDetail = embeddingAvailable ? `zhipu/${embeddingModel}` : "zhipu (ZHIPU_API_KEY not set)";
            break;
          }
          case "none":
            embeddingDetail = "disabled";
            break;
        }

        // Determine search tier (WASM is required for indexer, which is required for Tier 1/2)
        const canUseIndexer = wasmExists; // Without WASM, indexer can't init
        const searchTier = canUseIndexer && indexDbExists && embeddingAvailable
          ? "hybrid"
          : canUseIndexer && (indexDbExists || totalFiles > 0) // indexer can build index from files
            ? "fts5"
            : "legacy";

        const tierLabel = searchTier === "hybrid"
          ? `${c.green}Hybrid (FTS5 + Vector)${c.reset}`
          : searchTier === "fts5"
            ? `${c.yellow}FTS5 (keyword only)${c.reset}`
            : `${c.red}Legacy (in-memory)${c.reset}`;

        // Default mode: compact summary
        console.log(`  ${totalFiles > 0 ? ok(`${totalFiles} memories`) : warn("No memories stored")} ${dimText(`(${globalNotes + projectNotes} notes, ${globalSessions + projectSessions} sessions)`)}`);
        console.log(`  ${wasmExists ? ok("WASM runtime") : fail("WASM runtime missing")} ${dimText(`sql-wasm.wasm`)}`);
        console.log(`  ${indexDbExists ? ok("SQLite index") : warn("No SQLite index")} ${dimText(`Search tier: `)}${tierLabel}`);
        console.log(`  ${embeddingAvailable ? ok(`Embedding: ${embeddingDetail}`) : (embeddingProvider === "none" ? dimText("○ Embedding: disabled") : warn(`Embedding: ${embeddingDetail}`))}`);

        if (!wasmExists) {
          console.log(`  ${dimText(`  Fix: run 'oh-my-claude doctor fix-mem'`)}`);
        }

        if (detail) {
          // Detailed memory info
          console.log(`\n  ${subheader("Storage:")}`);
          console.log(`    Global: ${dimText(globalMemDir)}`);
          console.log(`      Notes: ${globalNotes}  Sessions: ${globalSessions}`);
          if (projectMemDir) {
            console.log(`    Project: ${dimText(projectMemDir)}`);
            console.log(`      Notes: ${projectNotes}  Sessions: ${projectSessions}`);
          } else {
            console.log(`    Project: ${dimText("(no project scope — not in a git repo)")}`);
          }

          console.log(`\n  ${subheader("WASM Runtime:")}`);
          if (wasmExists) {
            try {
              const wasmStats = statSync(wasmPath);
              const wasmSizeKB = (wasmStats.size / 1024).toFixed(1);
              console.log(`    ${ok(`sql-wasm.wasm: ${wasmSizeKB} KB`)}`);
            } catch {
              console.log(`    ${ok("sql-wasm.wasm found")}`);
            }
            console.log(`    Path: ${dimText(wasmPath)}`);
          } else {
            console.log(`    ${fail("sql-wasm.wasm NOT FOUND — SQLite indexer cannot initialize")}`);
            console.log(`    ${dimText(`Expected: ${wasmPath}`)}`);
            console.log(`    ${dimText(`Fix: run 'oh-my-claude doctor fix-mem'`)}`);
          }

          console.log(`\n  ${subheader("Index:")}`);
          if (indexDbExists) {
            try {
              const dbStats = statSync(indexDbPath);
              const dbSizeKB = (dbStats.size / 1024).toFixed(1);
              console.log(`    ${ok(`index.db: ${dbSizeKB} KB`)}`);
            } catch {
              console.log(`    ${ok("index.db exists")}`);
            }
          } else {
            console.log(`    ${warn("index.db not found — index is built on-demand when recall is first used")}`);
            console.log(`    ${dimText(`Expected: ${indexDbPath}`)}`);
          }

          console.log(`\n  ${subheader("Embedding Provider:")}`);
          console.log(`    Configured: ${c.cyan}${embeddingProvider}${c.reset}`);
          if (embeddingProvider === "custom") {
            const apiBase = process.env.EMBEDDING_API_BASE;
            const model = process.env.EMBEDDING_MODEL;
            const apiKey = process.env.EMBEDDING_API_KEY;
            const dims = process.env.EMBEDDING_DIMENSIONS;
            console.log(`    EMBEDDING_API_BASE: ${apiBase ? `${c.green}${apiBase}${c.reset}` : `${c.red}(not set)${c.reset}`}`);
            console.log(`    EMBEDDING_MODEL: ${model ? `${c.green}${model}${c.reset}` : `${c.dim}(default: text-embedding-3-small)${c.reset}`}`);
            console.log(`    EMBEDDING_API_KEY: ${apiKey ? `${c.green}(set)${c.reset}` : `${c.dim}(not set — OK for local Ollama)${c.reset}`}`);
            if (dims) console.log(`    EMBEDDING_DIMENSIONS: ${c.green}${dims}${c.reset}`);

            // Connectivity test for custom provider (using fetch instead of curl for Windows compat)
            if (apiBase) {
              try {
                const url = apiBase.replace(/\/+$/, "").replace(/\/embeddings$/, "") + "/embeddings";
                const headers: Record<string, string> = { "Content-Type": "application/json" };
                const apiKey = process.env.EMBEDDING_API_KEY;
                if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
                const resp = await fetch(url, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ model: model ?? "text-embedding-3-small", input: ["test"] }),
                  signal: AbortSignal.timeout(5000),
                });
                if (resp.ok) {
                  console.log(`    Connectivity: ${c.green}OK (HTTP ${resp.status})${c.reset}`);
                } else {
                  console.log(`    Connectivity: ${c.yellow}HTTP ${resp.status}${c.reset}`);
                }
              } catch {
                console.log(`    Connectivity: ${c.red}FAILED (cannot reach ${apiBase})${c.reset}`);
              }
            }
          } else if (embeddingProvider === "zhipu") {
            console.log(`    ZHIPU_API_KEY: ${process.env.ZHIPU_API_KEY ? `${c.green}(set)${c.reset}` : `${c.red}(not set)${c.reset}`}`);
            console.log(`    Model: ${embeddingModel}`);
          }

          console.log(`\n  ${subheader("Search Tier:")}`);
          console.log(`    Active: ${tierLabel}`);
          if (searchTier === "legacy") {
            console.log(`    ${dimText("Tier 1 (Hybrid): Requires index.db + embedding provider")}`);
            console.log(`    ${dimText("Tier 2 (FTS5):   Requires index.db (built on first recall)")}`);
            console.log(`    ${dimText("Tier 3 (Legacy): In-memory token matching (current)")}`);
          } else if (searchTier === "fts5") {
            console.log(`    ${dimText("To enable Tier 1 (Hybrid), configure an embedding provider")}`);
          }
        }
      } catch (error) {
        console.log(`  ${fail(`Memory system check failed: ${error}`)}`);
      }

      // Recommendations
      console.log(`\n${header("Recommendations:")}`);

      const providers = getProvidersStatus();
      const oauthTypes = new Set(["openai-oauth"]);
      const unconfiguredApiKey = Object.entries(providers)
        .filter(([_, info]) => !info.configured && info.type !== "claude-subscription" && !oauthTypes.has(info.type))
        .map(([name]) => name);
      const unconfiguredOAuth = Object.entries(providers)
        .filter(([_, info]) => !info.configured && oauthTypes.has(info.type))
        .map(([name]) => name);

      if (unconfiguredApiKey.length > 0) {
        console.log(`  ${warn(`Set API keys for: ${c.yellow}${unconfiguredApiKey.join(", ")}${c.reset}`)}`);
        if (detail) {
          for (const provider of unconfiguredApiKey) {
            console.log(`    ${c.dim}export ${provider.toUpperCase()}_API_KEY=your-key${c.reset}`);
          }
        }
      }
      if (unconfiguredOAuth.length > 0) {
        console.log(`  ${warn(`Authenticate OAuth: ${c.yellow}${unconfiguredOAuth.join(", ")}${c.reset}`)}`);
        if (detail) {
          for (const provider of unconfiguredOAuth) {
            console.log(`    ${c.dim}oh-my-claude auth login ${provider}${c.reset}`);
          }
        }
      }
      if (unconfiguredApiKey.length === 0 && unconfiguredOAuth.length === 0) {
        console.log(`  ${ok("All providers configured")}`);
      }

      if (!status.installed) {
        console.log(`  ${warn("Run 'oh-my-claude install' to complete setup")}`);
      }

      if (!detail && !options.fixMem) {
        console.log(`\n${dimText("Tip: Run 'oh-my-claude doctor --detail' for detailed component status")}`);
      }

      // ---- fix-mem: repair memory system ----
      if (options.fixMem) {
        console.log(`\n${header("Fixing Memory System...")}`);

        const mcpDir = join(INSTALL_DIR, "mcp");
        const wasmTarget = join(mcpDir, "sql-wasm.wasm");
        let fixCount = 0;

        // Step 1: Ensure WASM file exists
        console.log(`\n  ${subheader("Step 1: WASM Runtime")}`);
        if (existsSync(wasmTarget)) {
          console.log(`    ${ok("sql-wasm.wasm already present")}`);
        } else {
          // Try to find WASM from various sources
          let wasmSource: string | null = null;

          // Source 1: node_modules (dev mode)
          try {
            const nmPath = require.resolve("sql.js-fts5/dist/sql-wasm.wasm");
            if (nmPath && existsSync(nmPath)) wasmSource = nmPath;
          } catch { /* not available */ }

          // Source 2: dist/mcp in source tree (just built)
          if (!wasmSource) {
            const distPath = join(process.cwd(), "dist", "mcp", "sql-wasm.wasm");
            if (existsSync(distPath)) wasmSource = distPath;
          }

          // Source 3: npm package dist
          if (!wasmSource) {
            try {
              const pkgPath = require.resolve("@lgcyaxi/oh-my-claude");
              const pkgDir = dirname(pkgPath);
              const npmWasm = join(pkgDir, "mcp", "sql-wasm.wasm");
              if (existsSync(npmWasm)) wasmSource = npmWasm;
            } catch { /* not available */ }
          }

          if (wasmSource) {
            try {
              mkdirSync(mcpDir, { recursive: true });
              copyFileSync(wasmSource, wasmTarget);
              console.log(`    ${ok(`Copied sql-wasm.wasm from ${wasmSource}`)}`);
              fixCount++;
            } catch (e: any) {
              console.log(`    ${fail(`Failed to copy WASM: ${e.message}`)}`);
            }
          } else {
            console.log(`    ${fail("Cannot find sql-wasm.wasm anywhere")}`);
            console.log(`    ${dimText("Try: bun install && bun run build:mcp && oh-my-claude install")}`);
          }
        }

        // Step 2: Rebuild SQLite index from markdown files
        console.log(`\n  ${subheader("Step 2: SQLite Index")}`);
        const memIndexDbPath = join(INSTALL_DIR, "memory", "index.db");

        if (!existsSync(join(mcpDir, "sql-wasm.wasm"))) {
          console.log(`    ${fail("Cannot rebuild index — WASM file missing (fix Step 1 first)")}`);
        } else {
          try {
            // Dynamic import to use the memory module
            const { MemoryIndexer, getMemoryDir, getProjectMemoryDir } = require("../../memory");

            const indexer = new MemoryIndexer({ dbPath: memIndexDbPath });
            await indexer.init();

            if (!indexer.isReady()) {
              console.log(`    ${fail("Indexer failed to initialize")}`);
            } else {
              // Build memory directories list
              const memDirs: Array<{ path: string; scope: string; projectRoot?: string }> = [];
              const globalDir = getMemoryDir();
              memDirs.push({ path: globalDir, scope: "global" });

              if (doctorProjectRoot) {
                const projectDir = getProjectMemoryDir(doctorProjectRoot);
                if (projectDir) {
                  memDirs.push({ path: projectDir, scope: "project", projectRoot: doctorProjectRoot });
                }
              }

              const syncResult = await indexer.syncFiles(memDirs);
              await indexer.flush();
              await indexer.close();

              const total = syncResult.added + syncResult.updated;
              if (total > 0 || syncResult.removed > 0) {
                console.log(`    ${ok(`Index rebuilt: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.removed} removed, ${syncResult.unchanged} unchanged`)}`);
                fixCount++;
              } else if (syncResult.unchanged > 0) {
                console.log(`    ${ok(`Index up to date (${syncResult.unchanged} files unchanged)`)}`);
              } else {
                console.log(`    ${warn("No memory files to index")}`);
              }

              // Show index size
              try {
                const dbStat = statSync(memIndexDbPath);
                console.log(`    ${dimText(`index.db: ${(dbStat.size / 1024).toFixed(1)} KB`)}`);
              } catch { /* ignore */ }
            }
          } catch (e: any) {
            console.log(`    ${fail(`Index rebuild failed: ${e.message}`)}`);
          }
        }

        // Step 3: Test embedding provider connectivity
        console.log(`\n  ${subheader("Step 3: Embedding Provider")}`);
        const fixEmbProvider = loadConfig().memory?.embedding?.provider ?? "custom";
        if (fixEmbProvider === "none") {
          console.log(`    ${dimText("Embedding disabled (provider: none)")}`);
        } else if (fixEmbProvider === "custom") {
          const apiBase = process.env.EMBEDDING_API_BASE;
          if (!apiBase) {
            console.log(`    ${warn("EMBEDDING_API_BASE not set — embedding disabled")}`);
          } else {
            const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
            try {
              const url = apiBase.replace(/\/+$/, "").replace(/\/embeddings$/, "") + "/embeddings";
              const headers: Record<string, string> = { "Content-Type": "application/json" };
              const embKey = process.env.EMBEDDING_API_KEY;
              if (embKey) headers["Authorization"] = `Bearer ${embKey}`;
              const resp = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify({ model, input: ["fix-mem connectivity test"] }),
                signal: AbortSignal.timeout(10000),
              });
              if (resp.ok) {
                console.log(`    ${ok(`${model} @ ${apiBase} — connectivity OK`)}`);
              } else {
                console.log(`    ${fail(`HTTP ${resp.status} from ${apiBase}`)}`);
              }
            } catch {
              console.log(`    ${fail(`Cannot reach ${apiBase} — is Ollama running?`)}`);
            }
          }
        } else {
          // fixEmbProvider is "zhipu" (the only remaining non-custom/non-none option)
          const keyEnv = "ZHIPU_API_KEY";
          const hasKey = !!process.env[keyEnv];
          console.log(`    ${hasKey ? ok(`${fixEmbProvider} API key set`) : fail(`${keyEnv} not set`)}`);
        }

        // Summary
        console.log(`\n  ${fixCount > 0 ? ok(`Fixed ${fixCount} issue(s)`) : ok("No issues to fix")}`);
      }
    });
}
