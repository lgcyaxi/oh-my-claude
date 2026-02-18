/**
 * cleanup command — Clean up stale session data and temporary files
 *
 * Extracted from cli.ts for modularity.
 */

import type { Command } from "commander";
import { existsSync, readdirSync, statSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createFormatters } from "../utils/colors";
import { INSTALL_DIR } from "../utils/paths";

export function registerCleanupCommand(program: Command) {
  program
    .command("cleanup")
    .description("Clean up stale session data and temporary files")
    .option("--dry-run", "Show what would be cleaned without deleting")
    .option("--force", "Clean all sessions (including recent ones)")
    .action((options) => {
      const { c, ok, fail, warn, dimText } = createFormatters();

      const dryRun = options.dryRun;
      const force = options.force;

      console.log("oh-my-claude Cleanup\n");

      if (dryRun) {
        console.log(warn("Dry run mode - no files will be deleted\n"));
      }
      if (force) {
        console.log(warn("Force mode - all sessions will be cleaned\n"));
      }

      const sessionsDir = join(INSTALL_DIR, "sessions");

      // Check if a process is running
      function isProcessRunning(pid: number): boolean {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      }

      let totalCleaned = 0;

      // Clean up session directories
      if (existsSync(sessionsDir)) {
        console.log("Session directories:");
        const entries = readdirSync(sessionsDir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const sessionDir = join(sessionsDir, entry.name);
            const dirName = entry.name;
            let shouldClean = false;
            let reason = "";

            // Check if this is a PID-based session
            if (dirName.startsWith("pid-")) {
              const pidStr = dirName.substring(4);
              const pid = parseInt(pidStr, 10);

              if (!isNaN(pid) && pid > 0) {
                if (!isProcessRunning(pid)) {
                  shouldClean = true;
                  reason = `PID ${pid} not running`;
                } else if (force) {
                  shouldClean = true;
                  reason = `forced (PID ${pid} running)`;
                } else {
                  console.log(`  ${dimText(dirName)} - active (PID running)`);
                }
              } else {
                shouldClean = true;
                reason = "invalid PID format";
              }
            } else {
              // Old format session - always clean with force, otherwise check age
              const stat = statSync(sessionDir);
              const ageMs = Date.now() - stat.mtimeMs;
              const ageHours = Math.floor(ageMs / (60 * 60 * 1000));

              if (force) {
                shouldClean = true;
                reason = `old format (${ageHours}h old)`;
              } else if (ageHours > 1) {
                shouldClean = true;
                reason = `stale (${ageHours}h old)`;
              } else {
                console.log(`  ${dimText(dirName)} - recent (<1h old)`);
              }
            }

            if (shouldClean) {
              if (dryRun) {
                console.log(`  ${warn(dirName)} - would delete (${reason})`);
                totalCleaned++;
              } else {
                try {
                  rmSync(sessionDir, { recursive: true, force: true });
                  console.log(`  ${ok(dirName)} - deleted (${reason})`);
                  totalCleaned++;
                } catch (error) {
                  console.log(`  ${fail(dirName)} - failed to delete`);
                }
              }
            }
          }
        }

        if (entries.length === 0) {
          console.log("  (no sessions found)");
        }
      } else {
        console.log("Session directories: (none)");
      }

      // Clean up PPID file if stale
      const ppidFile = join(INSTALL_DIR, "current-ppid.txt");
      if (existsSync(ppidFile)) {
        console.log("\nPPID tracking file:");
        try {
          const content = readFileSync(ppidFile, "utf-8").trim();
          const parts = content.split(":");
          const pid = parseInt(parts[0] ?? "", 10);
          const timestamp = parseInt(parts[1] ?? "", 10);
          const ageMs = Date.now() - timestamp;
          const ageMinutes = Math.floor(ageMs / (60 * 1000));

          if (!isNaN(pid) && pid > 0 && isProcessRunning(pid) && !force) {
            console.log(`  ${dimText("current-ppid.txt")} - active (PID ${pid} running)`);
          } else {
            if (dryRun) {
              console.log(`  ${warn("current-ppid.txt")} - would delete (PID ${pid} not running, ${ageMinutes}m old)`);
              totalCleaned++;
            } else {
              rmSync(ppidFile, { force: true });
              console.log(`  ${ok("current-ppid.txt")} - deleted (PID ${pid} not running)`);
              totalCleaned++;
            }
          }
        } catch {
          if (dryRun) {
            console.log(`  ${warn("current-ppid.txt")} - would delete (unreadable)`);
            totalCleaned++;
          } else {
            rmSync(ppidFile, { force: true });
            console.log(`  ${ok("current-ppid.txt")} - deleted (unreadable)`);
            totalCleaned++;
          }
        }
      }

      // Clean up debug logs
      const debugLog = join(INSTALL_DIR, "task-tracker-debug.log");
      if (existsSync(debugLog)) {
        console.log("\nDebug logs:");
        const stat = statSync(debugLog);
        const sizeKb = Math.round(stat.size / 1024);

        if (dryRun) {
          console.log(`  ${warn("task-tracker-debug.log")} - would delete (${sizeKb}KB)`);
          totalCleaned++;
        } else {
          rmSync(debugLog, { force: true });
          console.log(`  ${ok("task-tracker-debug.log")} - deleted (${sizeKb}KB)`);
          totalCleaned++;
        }
      }

      console.log();
      if (dryRun) {
        console.log(`Dry run complete. Would clean ${totalCleaned} item(s).`);
      } else {
        console.log(`Cleanup complete. Removed ${totalCleaned} item(s).`);
      }
    });
}
