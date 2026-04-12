/**
 * Doctor zone: Companion Tools (--detail only)
 *
 * Checks for external companion tools: UI UX Pro Max, OpenCode, Codex,
 * oh-my-opencode, tmux, and output styles.
 */

import type { DoctorContext } from "./types";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

function isCommandAvailable(name: string): boolean {
  try {
    execSync(process.platform === "win32" ? `where ${name}` : `which ${name}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function checkCompanionsZone(ctx: DoctorContext) {
  const { ok, header, dimText, c } = ctx.formatters;

  console.log(`\n${header("Companion Tools:")}`);

  // UI UX Pro Max
  const globalSkillDir = join(homedir(), ".claude", "skills", "ui-ux-pro-max");
  const localSkillDir = join(process.cwd(), ".claude", "skills", "ui-ux-pro-max");
  const skillDir = existsSync(globalSkillDir) ? globalSkillDir : existsSync(localSkillDir) ? localSkillDir : null;
  const skillExists = skillDir !== null;
  console.log(`  ${skillExists ? ok("UI UX Pro Max") : dimText("○ UI UX Pro Max (not installed)")}`);
  if (skillExists) {
    const skillMd = join(skillDir, "SKILL.md");
    console.log(`    Path: ${dimText(skillDir)}`);
    console.log(`    SKILL.md: ${existsSync(skillMd) ? `${c.green}found${c.reset}` : `${c.red}missing${c.reset}`}`);
  }

  // OpenCode CLI
  const opencodeInstalled = isCommandAvailable("opencode");
  console.log(`  ${opencodeInstalled ? ok("OpenCode CLI") : dimText("○ OpenCode CLI (not installed)")}`);
  if (!opencodeInstalled) {
    console.log(`    ${dimText("Install: npm install -g opencode-ai")}`);
  }

  // Codex CLI
  const codexInstalled = isCommandAvailable("codex");
  console.log(`  ${codexInstalled ? ok("Codex CLI") : dimText("○ Codex CLI (not installed)")}`);
  if (!codexInstalled) {
    console.log(`    ${dimText("Install: npm install -g @openai/codex")}`);
  }

  // oh-my-opencode
  const ohmyopencodeInstalled = isCommandAvailable("oh-my-opencode");
  console.log(`  ${ohmyopencodeInstalled ? ok("oh-my-opencode") : dimText("○ oh-my-opencode (not installed)")}`);
  if (!ohmyopencodeInstalled) {
    console.log(`    ${dimText("Install: npm install -g oh-my-opencode")}`);
  }

  // tmux (psmux on Windows)
  const tmuxInstalled = isCommandAvailable("tmux");
  console.log(`  ${tmuxInstalled ? ok("tmux") : dimText("○ tmux (not installed)")}`);
  if (!tmuxInstalled) {
    if (process.platform === "win32") {
      console.log(`    ${dimText("Install: winget install psmux")}`);
    } else if (process.platform === "darwin") {
      console.log(`    ${dimText("Install: brew install tmux")}`);
    } else {
      console.log(`    ${dimText("Install: sudo apt install tmux or sudo pacman -S tmux")}`);
    }
  }

  // Output styles
  const stylesDir = join(homedir(), ".claude", "output-styles");
  const stylesExist = existsSync(stylesDir);
  if (stylesExist) {
    const styleCount = readdirSync(stylesDir).filter((f: string) => f.endsWith(".md")).length;
    console.log(`  ${ok(`Output styles: ${styleCount} style(s)`)}`);
  } else {
    console.log(`  ${dimText("○ Output styles (not deployed)")}`);
  }
}
