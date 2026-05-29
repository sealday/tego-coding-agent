import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StateManager } from "../../src/core/state-manager.js";
import type { TaskList } from "../../src/types/index.js";

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "tego-state-"));
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

function taskList(overrides: Partial<TaskList> = {}): TaskList {
  return {
    project: { name: "demo", version: "0.1.0", createdAt: "2026-01-01T00:00:00.000Z" },
    tasks: [
      {
        id: "T001",
        title: "Create base app",
        description: "Create the first feature.",
        status: "pending",
        dependencies: [],
        attempts: 0,
        acceptanceCriteria: [{ id: "AC001", description: "The app starts.", steps: ["Run the app"] }],
      },
      {
        id: "T002",
        title: "Add follow-up feature",
        description: "Depends on the base app.",
        status: "pending",
        dependencies: ["T001"],
        attempts: 0,
        acceptanceCriteria: [],
      },
    ],
    statistics: { total: 2, pending: 2, inProgress: 0, completed: 0, blocked: 0, needsHuman: 0 },
    ...overrides,
  };
}

describe("StateManager", () => {
  it("creates the harness directory and stores specs and task lists", async () => {
    const manager = new StateManager(projectDir);

    await manager.initializeHarness();
    await manager.saveSpec("# Specification");
    await manager.saveTasks(taskList());

    expect(await manager.loadSpec()).toBe("# Specification");
    expect((await manager.loadTasks()).tasks).toHaveLength(2);
  });

  it("selects the next pending task only when dependencies are complete", async () => {
    const manager = new StateManager(projectDir);
    await manager.initializeHarness();
    await manager.saveTasks(taskList());

    expect((await manager.getNextPendingTask())?.id).toBe("T001");
    await manager.updateTaskStatus("T001", "completed");
    expect((await manager.getNextPendingTask())?.id).toBe("T002");
  });

  it("updates statistics whenever task status changes", async () => {
    const manager = new StateManager(projectDir);
    await manager.initializeHarness();
    await manager.saveTasks(taskList());

    await manager.updateTaskStatus("T001", "in_progress");
    await manager.incrementTaskAttempts("T001");
    const updated = await manager.loadTasks();

    expect(updated.statistics).toEqual({ total: 2, pending: 1, inProgress: 1, completed: 0, blocked: 0, needsHuman: 0 });
    expect(updated.tasks[0]?.attempts).toBe(1);
  });

  it("appends progress entries as JSON lines", async () => {
    const manager = new StateManager(projectDir);
    await manager.initializeHarness();

    await manager.appendProgress({ timestamp: "2026-01-01T00:00:00.000Z", taskId: "T001", status: "completed", details: "Done" });

    const content = await readFile(join(projectDir, ".harness", "progress.txt"), "utf-8");
    expect(JSON.parse(content.trim())).toMatchObject({ taskId: "T001", status: "completed" });
  });
});
