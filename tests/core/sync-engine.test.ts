import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SyncEngine } from "../../src/core/sync-engine.js";
import { StateManager } from "../../src/core/state-manager.js";
import type { TaskList } from "../../src/types/index.js";

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "tego-sync-"));
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

function emptyTasks(): TaskList {
  return { project: { name: "demo", version: "0.1.0", createdAt: "2026-01-01T00:00:00.000Z" }, tasks: [], statistics: { total: 0, pending: 0, inProgress: 0, completed: 0, blocked: 0, needsHuman: 0 } };
}

describe("SyncEngine", () => {
  it("reports documented features that are missing from tasks", async () => {
    const manager = new StateManager(projectDir);
    await manager.initializeHarness();
    await manager.saveTasks(emptyTasks());
    await mkdir(join(projectDir, "docs"), { recursive: true });
    await writeFile(join(projectDir, "docs", "PRD.md"), "# PRD\n\n## User login\nUsers can sign in.\n", "utf-8");

    const report = await new SyncEngine(projectDir, { checkOnly: true, autoFix: false, docsDir: "docs" }).sync();

    expect(report.summary.discrepancies).toBe(1);
    expect(report.discrepancies[0]?.type).toBe("doc_without_task");
  });

  it("adds missing tasks when auto-fix is enabled", async () => {
    const manager = new StateManager(projectDir);
    await manager.initializeHarness();
    await manager.saveTasks(emptyTasks());
    await mkdir(join(projectDir, "docs"), { recursive: true });
    await writeFile(join(projectDir, "docs", "PRD.md"), "# PRD\n\n## Billing export\nUsers can export invoices.\n", "utf-8");

    const report = await new SyncEngine(projectDir, { checkOnly: false, autoFix: true, docsDir: "docs" }).sync();
    const tasks = JSON.parse(await readFile(join(projectDir, ".harness", "tasks.json"), "utf-8"));

    expect(report.summary.autoFixed).toBe(1);
    expect(tasks.tasks[0].title).toBe("Billing export");
  });
});
