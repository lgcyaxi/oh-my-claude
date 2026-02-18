/**
 * CLI "setup-mcp" command — Install official MCP servers (MiniMax, GLM/ZhiPu)
 *
 * Supports selective installation via --minimax, --glm, --thinking flags.
 */

import type { Command } from "commander";
import { execSync } from "node:child_process";
import { createFormatters } from "../utils/colors";

export function registerSetupMcpCommand(program: Command) {
  program
    .command("setup-mcp")
    .description("Install official MCP servers (MiniMax, GLM/ZhiPu)")
    .option("--minimax", "Install MiniMax MCP only")
    .option("--glm", "Install GLM/ZhiPu MCPs only")
    .option("--thinking", "Install Sequential Thinking MCP only")
    .option("--list", "List available MCP servers")
    .action(async (options) => {
      const { c, ok, fail, warn, dimText } = createFormatters();

      // Custom header for this command (cyan+bold, no leading newline)
      const header = (text: string) =>
        `${c.cyan}${c.bold}${text}${c.reset}`;

      // Available MCP servers
      const mcpServers = {
        "sequential-thinking": {
          name: "sequential-thinking",
          description:
            "Dynamic problem-solving through structured thought sequences",
          envKey: null as string | null, // No API key required
          type: "stdio",
          command:
            "claude mcp add --scope user sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking",
        },
        minimax: {
          name: "MiniMax",
          description: "MiniMax coding plan MCP server",
          envKey: "MINIMAX_API_KEY",
          type: "stdio",
          command:
            "claude mcp add --scope user MiniMax -- uvx minimax-coding-plan-mcp -y",
        },
        "web-reader": {
          name: "web-reader",
          description: "GLM web content reader",
          envKey: "ZHIPU_API_KEY",
          type: "http",
          url: "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
        },
        "web-search-prime": {
          name: "web-search-prime",
          description: "GLM web search",
          envKey: "ZHIPU_API_KEY",
          type: "http",
          url: "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
        },
        zread: {
          name: "zread",
          description: "GLM GitHub repository reader",
          envKey: "ZHIPU_API_KEY",
          type: "http",
          url: "https://open.bigmodel.cn/api/mcp/zread/mcp",
        },
        "zai-mcp-server": {
          name: "zai-mcp-server",
          description: "GLM AI image/video analysis",
          envKey: "ZHIPU_API_KEY",
          type: "http",
          url: "https://open.bigmodel.cn/api/mcp/zai_mcp_server/mcp",
        },
      };

      // List mode
      if (options.list) {
        console.log(header("Available MCP Servers:\n"));

        console.log(`  ${c.bold}Anthropic Official:${c.reset}`);
        console.log(
          `    ${dimText("-")} sequential-thinking: ${mcpServers["sequential-thinking"].description}`
        );
        console.log(
          `      ${c.green}No API key required${c.reset}\n`
        );

        console.log(`  ${c.bold}MiniMax:${c.reset}`);
        console.log(
          `    ${dimText("-")} MiniMax: ${mcpServers.minimax.description}`
        );
        console.log(
          `      Requires: ${c.cyan}MINIMAX_API_KEY${c.reset}\n`
        );

        console.log(`  ${c.bold}GLM/ZhiPu:${c.reset}`);
        for (const [key, server] of Object.entries(mcpServers)) {
          if (server.envKey === "ZHIPU_API_KEY") {
            console.log(
              `    ${dimText("-")} ${server.name}: ${server.description}`
            );
          }
        }
        console.log(
          `      Requires: ${c.cyan}ZHIPU_API_KEY${c.reset}`
        );
        return;
      }

      // Determine what to install (if none specified, install all)
      const hasSpecificOption =
        options.minimax || options.glm || options.thinking;
      const installThinking = options.thinking || !hasSpecificOption;
      const installMinimax = options.minimax || !hasSpecificOption;
      const installGlm = options.glm || !hasSpecificOption;

      console.log(header("Setting up official MCP servers...\n"));

      let hasErrors = false;

      // Install Sequential Thinking (no API key required)
      if (installThinking) {
        console.log(`${c.bold}Anthropic Official:${c.reset}`);
        try {
          const mcpList = execSync("claude mcp list", {
            encoding: "utf-8",
          });
          if (mcpList.includes("sequential-thinking")) {
            console.log(
              `  ${ok("sequential-thinking already installed")}`
            );
          } else {
            execSync(mcpServers["sequential-thinking"].command, {
              stdio: "pipe",
            });
            console.log(
              `  ${ok("sequential-thinking installed")}`
            );
          }
        } catch (error) {
          console.log(
            `  ${fail("Failed to install sequential-thinking")}`
          );
          hasErrors = true;
        }
      }

      // Install MiniMax
      if (installMinimax) {
        console.log(`\n${c.bold}MiniMax:${c.reset}`);
        const minimaxKey = process.env.MINIMAX_API_KEY;
        if (!minimaxKey) {
          console.log(
            `  ${warn("MINIMAX_API_KEY not set - skipping MiniMax")}`
          );
          console.log(
            `    ${dimText("Set it with: export MINIMAX_API_KEY=your-key")}`
          );
        } else {
          try {
            // Check if already installed
            const mcpList = execSync("claude mcp list", {
              encoding: "utf-8",
            });
            if (mcpList.includes("MiniMax")) {
              console.log(
                `  ${ok("MiniMax already installed")}`
              );
            } else {
              execSync(mcpServers.minimax.command, {
                stdio: "inherit",
              });
              console.log(`  ${ok("MiniMax installed")}`);
            }
          } catch (error) {
            console.log(
              `  ${fail("Failed to install MiniMax")}`
            );
            hasErrors = true;
          }
        }
      }

      // Install GLM MCPs
      if (installGlm) {
        console.log(`\n${c.bold}GLM/ZhiPu:${c.reset}`);
        const zhipuKey = process.env.ZHIPU_API_KEY;
        if (!zhipuKey) {
          console.log(
            `  ${warn("ZHIPU_API_KEY not set - skipping GLM MCPs")}`
          );
          console.log(
            `    ${dimText("Set it with: export ZHIPU_API_KEY=your-key")}`
          );
        } else {
          const glmServers = Object.entries(mcpServers).filter(
            ([_, s]) => s.envKey === "ZHIPU_API_KEY"
          );

          for (const [key, server] of glmServers) {
            try {
              // Check if already installed
              const mcpList = execSync("claude mcp list", {
                encoding: "utf-8",
              });
              if (mcpList.includes(server.name)) {
                console.log(
                  `  ${ok(`${server.name} already installed`)}`
                );
              } else {
                // Install HTTP MCP with Authorization header
                const cmd = `claude mcp add --scope user --transport http -H "Authorization: Bearer ${zhipuKey}" ${server.name} ${(server as any).url}`;
                execSync(cmd, { stdio: "pipe" });
                console.log(
                  `  ${ok(`${server.name} installed`)}`
                );
              }
            } catch (error) {
              console.log(
                `  ${fail(`Failed to install ${server.name}`)}`
              );
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
        console.log(
          `\n${dimText("Restart Claude Code to activate the new MCP servers.")}`
        );
      }
    });
}
