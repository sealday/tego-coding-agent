import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface CostEntry {
  sessionId: string;
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: string;
}

export class CostTracker {
  constructor(private readonly harnessDir: string) {}

  async initialize(): Promise<void> {
    await mkdir(this.harnessDir, { recursive: true });
    if (!existsSync(this.path)) {
      await writeFile(this.path, `${JSON.stringify({ entries: [] }, null, 2)}\n`, "utf-8");
    }
  }

  async record(entry: Omit<CostEntry, "timestamp">): Promise<void> {
    await this.initialize();
    const current = JSON.parse(await readFile(this.path, "utf-8")) as { entries: CostEntry[] };
    current.entries.push({ ...entry, timestamp: new Date().toISOString() });
    await writeFile(this.path, `${JSON.stringify(current, null, 2)}\n`, "utf-8");
  }

  private get path(): string {
    return join(this.harnessDir, "costs.json");
  }
}

export function createCostTracker(harnessDir: string): CostTracker {
  return new CostTracker(harnessDir);
}
