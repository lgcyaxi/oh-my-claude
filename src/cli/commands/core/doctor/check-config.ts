/**
 * Doctor zone: Configuration
 *
 * Checks config loading, agent count, and category count.
 */

import type { DoctorContext } from "./types";
import { loadConfig } from "../../../../shared/config";

export async function checkConfigZone(ctx: DoctorContext) {
  const { ok, fail, header, subheader, dimText, c } = ctx.formatters;

  console.log(`\n${header("Configuration:")}`);
  try {
    const config = loadConfig();
    console.log(`  ${ok("Configuration loaded")}`);
    console.log(`  ${dimText("-")} ${Object.keys(config.agents).length} agents configured`);
    console.log(`  ${dimText("-")} ${Object.keys(config.categories).length} categories configured`);

    if (ctx.detail) {
      const configuredAgents = Object.entries(config.agents);
      if (configuredAgents.length > 0) {
        console.log(`\n  ${subheader("Configured agents:")}`);
        for (const [name, agentConfig] of configuredAgents) {
          const provider = (agentConfig as any).provider;
          const model = (agentConfig as any).model;
          console.log(`    ${dimText("-")} ${c.bold}${name}${c.reset}: ${c.cyan}${provider}${c.reset}/${c.blue}${model}${c.reset}`);
        }
      }
    }
  } catch (error) {
    console.log(`  ${fail("Failed to load configuration:")} ${error}`);
  }
}
