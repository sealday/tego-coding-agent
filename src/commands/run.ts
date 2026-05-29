import { access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Orchestrator } from "../core/orchestrator.js";
import type { RunCommandOptions } from "../types/index.js";

export interface RunCommandDeps {
  createOrchestrator?: (projectDir: string) => Orchestrator;
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  exit?: (code: number) => never | void;
}

export async function runCommand(projectDir: string, options: RunCommandOptions, deps: RunCommandDeps = {}): Promise<void> {
  const log = deps.log ?? console.log;
  const error = deps.error ?? console.error;
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const absolutePath = resolve(projectDir);
  const harnessDir = join(absolutePath, ".harness");

  try {
    await access(harnessDir);
  } catch {
    error("Project is not initialized. Run init first.");
    exit(1);
    return;
  }
  try {
    await access(join(harnessDir, "tasks.json"));
  } catch {
    error("Task list not found. Run init first.");
    exit(1);
    return;
  }

  const maxTasks = options.maxTasks ? Number.parseInt(options.maxTasks, 10) : 10;
  const maxTokens = options.maxTokens ? Number.parseInt(options.maxTokens, 10) : undefined;
  const orchestrator = deps.createOrchestrator?.(absolutePath) ?? new Orchestrator(absolutePath);
  await orchestrator.run(maxTasks, maxTokens);
  const status = await orchestrator.getStatus();

  if (status.isComplete) log("Project is complete.");
  else if (status.nextTask) log(`Execution paused. Next task: ${status.nextTask.title}`);
  else log("Execution paused. No runnable task is available.");
}
