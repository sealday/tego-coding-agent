import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { Orchestrator } from "../core/orchestrator.js";
import type { InitCommandOptions } from "../types/index.js";

const execFileAsync = promisify(execFile);

export interface InitCommandDeps {
  createOrchestrator?: (projectDir: string) => Orchestrator;
  runGitInit?: (projectDir: string) => Promise<void>;
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  exit?: (code: number) => never | void;
}

export async function initCommand(projectDir: string, options: InitCommandOptions, deps: InitCommandDeps = {}): Promise<void> {
  const log = deps.log ?? console.log;
  const error = deps.error ?? console.error;
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const absolutePath = resolve(projectDir);
  const mode = options.mode ?? "full";

  log("Initializing project...");
  log(`Project directory: ${absolutePath}`);
  log(`Initialization mode: ${mode}`);

  await mkdir(absolutePath, { recursive: true });
  await mkdir(join(absolutePath, ".harness"), { recursive: true });

  let prdContent = "";
  let existingDocs: Record<string, string> = {};
  let prdSource = "";

  if (mode === "full") {
    const docsDir = options.docs ? resolve(options.docs) : join(absolutePath, "docs");
    await mkdir(docsDir, { recursive: true });
    existingDocs = await collectExistingDocuments(docsDir);
    if (options.prd) {
      prdContent = await readFile(options.prd, "utf-8");
      prdSource = options.prd;
    } else if (existingDocs["PRD.md"]) {
      prdContent = existingDocs["PRD.md"];
      prdSource = "docs/PRD.md";
    } else if (Object.keys(existingDocs).length === 0) {
      error("Full mode requires --prd or a docs directory containing Markdown or text files.");
      exit(1);
      return;
    }
  } else {
    if (options.prd) {
      prdContent = await readFile(options.prd, "utf-8");
      prdSource = options.prd;
    } else if (options.json) {
      prdContent = `Requirement definition:\n\n\`\`\`json\n${await readFile(options.json, "utf-8")}\n\`\`\``;
      prdSource = options.json;
    } else if (options.text) {
      prdContent = `User requirement:\n${options.text}`;
      prdSource = "text input";
    } else {
      error("Simple mode requires one of --prd, --json, or --text.");
      exit(1);
      return;
    }
  }

  try {
    if (deps.runGitInit) await deps.runGitInit(absolutePath);
    else await execFileAsync("git", ["init"], { cwd: absolutePath });
  } catch {
    log("Git initialization was skipped.");
  }

  const orchestrator = deps.createOrchestrator?.(absolutePath) ?? new Orchestrator(absolutePath);
  await orchestrator.initialize(prdContent, options.name, { mode, existingDocs: mode === "full" ? existingDocs : undefined, prdSource });
  log("Initialization complete.");
}

async function collectExistingDocuments(docsDir: string): Promise<Record<string, string>> {
  const docs: Record<string, string> = {};
  const entries = await readdir(docsDir).catch(() => []);
  for (const entry of entries) {
    const filePath = join(docsDir, entry);
    const info = await stat(filePath).catch(() => undefined);
    if (!info?.isFile()) continue;
    if (!entry.endsWith(".md") && !entry.endsWith(".txt")) continue;
    docs[entry] = await readFile(filePath, "utf-8");
  }
  return docs;
}
