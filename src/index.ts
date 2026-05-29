#!/usr/bin/env bun
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { providerCommand } from "./commands/provider.js";
import { runCommand } from "./commands/run.js";
import { syncCommand } from "./commands/sync.js";

const program = new Command();

program
  .name("tego-coding-agent")
  .description("Bun-based autonomous coding harness built on the PI Coding Agent SDK.")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize a project from requirements.")
  .argument("<project-dir>", "Project directory")
  .option("-p, --prd <file>", "Markdown PRD file")
  .option("--json <file>", "JSON requirement file")
  .option("--text <text>", "Plain English requirement text")
  .option("-n, --name <name>", "Project name")
  .option("-m, --mode <mode>", "Initialization mode: simple or full", "full")
  .option("--docs <dir>", "Existing docs directory")
  .action((projectDir, options) => initCommand(projectDir, options));

program
  .command("run")
  .description("Run pending tasks.")
  .argument("<project-dir>", "Initialized project directory")
  .option("-m, --max-tasks <number>", "Maximum tasks to process", "10")
  .option("-t, --max-tokens <number>", "Token budget")
  .option("--continue", "Continue previous execution")
  .action((projectDir, options) => runCommand(projectDir, options));

program
  .command("sync")
  .description("Compare docs with task state and optionally add missing tasks.")
  .argument("<project-dir>", "Initialized project directory")
  .option("--fix", "Apply safe automatic fixes")
  .option("--docs <dir>", "Docs directory", "docs")
  .action((projectDir, options) => syncCommand(projectDir, options));

program
  .command("provider")
  .description("Manage AI provider configuration.")
  .option("-l, --list", "List providers")
  .option("-a, --add", "Add a provider")
  .option("-e, --edit <name>", "Edit a provider")
  .option("-s, --switch <name>", "Switch active provider")
  .option("-r, --remove <name>", "Remove a provider")
  .option("--test <name>", "Validate provider configuration")
  .option("--name <name>", "Provider name")
  .option("--token <token>", "Provider API token")
  .option("--url <url>", "Provider base URL")
  .option("--model <model>", "Provider model ID")
  .action((options) => providerCommand(options));

program.showHelpAfterError();
program.parse(process.argv);
