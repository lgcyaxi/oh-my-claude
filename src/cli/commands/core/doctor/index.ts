/**
 * Doctor command — diagnose oh-my-claude configuration
 *
 * Orchestrator that delegates to zone-specific check modules:
 *   check-installation  — core files + version/channel
 *   check-components    — agents, commands, MCP, hooks, statusline (--detail)
 *   check-companions    — companion tools (--detail)
 *   check-providers     — providers, coworker readiness, OAuth
 *   check-config        — configuration loading
 *   check-memory        — memory system health + fix-mem repair
 *   check-recommendations — final recommendations
 */

import type { Command } from "commander";
import { createFormatters } from "../../../utils/colors";
import type { DoctorContext } from "./types";
import { findProjectRoot } from "./types";
import { checkInstallationZone } from "./check-installation";
import { checkComponentsZone } from "./check-components";
import { checkCompanionsZone } from "./check-companions";
import { checkProvidersZone } from "./check-providers";
import { checkConfigZone } from "./check-config";
import { checkMemoryZone } from "./check-memory";
import { checkRecommendationsZone } from "./check-recommendations";

export function registerDoctorCommand(program: Command) {
  program
    .command("doctor")
    .description("Diagnose oh-my-claude configuration")
    .option("--detail", "Show detailed status of each component")
    .option("--fix-mem", "Fix memory system issues (copy WASM, rebuild index)")
    .option("--no-color", "Disable colored output")
    .action(async (options) => {
      const detail = options.detail;
      const fixMem = !!options.fixMem;
      const useColor = options.color !== false && process.stdout.isTTY;
      const formatters = createFormatters(useColor);
      const { c, dimText } = formatters;

      const projectRoot = findProjectRoot();

      const ctx: DoctorContext = { detail, fixMem, formatters, projectRoot };

      console.log(`${c.bold}${c.magenta}oh-my-claude Doctor${c.reset}\n`);

      const installStatus = await checkInstallationZone(ctx);
      if (detail) {
        await checkComponentsZone(ctx);
        await checkCompanionsZone(ctx);
      }
      await checkProvidersZone(ctx);
      await checkConfigZone(ctx);
      await checkMemoryZone(ctx);
      await checkRecommendationsZone(ctx, installStatus);

      if (!detail && !fixMem) {
        console.log(`\n${dimText("Tip: Run 'oh-my-claude doctor --detail' for detailed component status")}`);
      }
    });
}
