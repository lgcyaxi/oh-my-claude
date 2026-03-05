/**
 * Doctor zone: Installation & Version
 *
 * Checks core file installation status and version/channel info.
 */

import type { DoctorContext } from "./types";
import { INSTALL_DIR } from "../../../utils/paths";
import { checkInstallation } from "../../../../integration/installer";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function checkInstallationZone(ctx: DoctorContext) {
  const { ok, fail, warn, header, dimText, c } = ctx.formatters;

  const status = checkInstallation();
  console.log(header("Installation:"));
  console.log(`  ${status.installed ? ok("Core files installed") : fail("Core files installed")}`);
  console.log(`  ${status.components.agents ? ok("Agent files generated") : fail("Agent files generated")}`);
  console.log(`  ${status.components.hooks ? ok("Hooks configured") : fail("Hooks configured")}`);
  console.log(`  ${status.components.mcp ? ok("MCP server configured") : fail("MCP server configured")}`);
  console.log(`  ${status.components.statusLine ? ok("StatusLine configured") : warn("StatusLine not configured")}`);
  console.log(`  ${status.components.config ? ok("Configuration file exists") : fail("Configuration file exists")}`);

  // Version and Channel info
  const { isBetaInstallation, getBetaChannelInfo } = require("../../../../integration/installer/beta-channel");

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

  return status;
}
