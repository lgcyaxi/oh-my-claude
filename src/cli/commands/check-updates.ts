import type { Command } from "commander";
import { execSync } from "node:child_process";
import { createFormatters } from "../utils/colors";

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

function isInstalled(command: string): boolean {
  try {
    const checkCmd = process.platform === "win32" ? "where" : "which";
    execSync(`${checkCmd} ${command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

let _bunAvailable: boolean | undefined;
function isBunAvailable(): boolean {
  if (_bunAvailable === undefined) {
    _bunAvailable = isInstalled("bun");
  }
  return _bunAvailable;
}

function getLatestNpmVersion(packageName: string): string | undefined {
  // Always use npm view for registry lookups — bun doesn't have an equivalent
  // (bun pm info doesn't exist). npm view is fast since it's just an HTTP call.
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

function getInstallCommand(packageName: string): string {
  return isBunAvailable()
    ? `bun install -g ${packageName}`
    : `npm install -g ${packageName}`;
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
    installCommand: getInstallCommand("opencode-ai"),
  });

  const codexInstalled = isInstalled("codex") || isInstalled("codex-cli");
  const codexVersion = codexInstalled
    ? (getToolVersion("codex") || getToolVersion("codex-cli"))
    : undefined;
  const codexLatest = getLatestNpmVersion("@openai/codex");
  tools.push({
    name: "codex",
    installed: codexInstalled,
    currentVersion: codexVersion,
    latestVersion: codexLatest,
    updateAvailable: codexInstalled && codexLatest !== undefined && codexVersion !== codexLatest,
    installCommand: getInstallCommand("@openai/codex"),
  });

  const ohmyopencodeInstalled = isInstalled("oh-my-opencode");
  const ohmyopencodeVersion = ohmyopencodeInstalled ? getToolVersion("oh-my-opencode") : undefined;
  const ohmyopencodeLatest = getLatestNpmVersion("oh-my-opencode");
  tools.push({
    name: "oh-my-opencode",
    installed: ohmyopencodeInstalled,
    currentVersion: ohmyopencodeVersion,
    latestVersion: ohmyopencodeLatest,
    updateAvailable: ohmyopencodeInstalled && ohmyopencodeLatest !== undefined && ohmyopencodeVersion !== ohmyopencodeLatest,
    installCommand: getInstallCommand("oh-my-opencode"),
  });
  
  return tools;
}

export function registerCheckUpdatesCommand(program: Command) {
  program
    .command("check-updates")
    .description("Check for updates to oh-my-claude and CLI tools")
    .option("--auto", "Auto-upgrade outdated tools without prompting")
    .option("--json", "Output results as JSON")
    .action(async (options) => {
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
          console.log(`${dimText(`○ ${tool.name}: not installed`)})`);
          console.log(`  ${dimText(`Install: ${tool.installCommand}`)}`);
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
        console.log(`${dimText("Or run oh-my-claude install-cli to install missing tools")}`);
      }
    });
}
