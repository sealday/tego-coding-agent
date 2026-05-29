import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { StateManager } from "../../src/core/state-manager.js";
import type { TaskList } from "../../src/types/index.js";

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "tego-orchestrator-"));
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

function tasks(): TaskList {
  return {
    project: { name: "demo", version: "0.1.0", createdAt: "2026-01-01T00:00:00.000Z" },
    tasks: [
      { id: "T001", title: "First", description: "First task", status: "pending", dependencies: [], attempts: 0, acceptanceCriteria: [] },
      { id: "T002", title: "Second", description: "Second task", status: "pending", dependencies: ["T001"], attempts: 0, acceptanceCriteria: [] },
    ],
    statistics: { total: 2, pending: 2, inProgress: 0, completed: 0, blocked: 0, needsHuman: 0 },
  };
}

describe("Orchestrator", () => {
  it("runs pending tasks through generation and evaluation", async () => {
    const manager = new StateManager(projectDir);
    await manager.initializeHarness();
    await manager.saveSpec("# Spec");
    await manager.saveTasks(tasks());

    const orchestrator = new Orchestrator(projectDir, {
      providerManager: { initialize: async () => undefined, getAuthStorage: () => ({}), getPIModel: () => ({ provider: "p", id: "m" }), getCurrentProvider: () => ({ model: "m" }), printStatus: () => undefined } as any,
      createPISession: async () => ({ run: async () => ({ success: true, stopReason: "stop", inputTokens: 3, outputTokens: 5 }), dispose: () => undefined, abort: () => undefined }),
      evaluator: { evaluate: async () => ({ summary: "Pass", criteriaResults: [], totalWeightedScore: 1, threshold: 0.75, finalDecision: "pass", feedbackForGenerator: "" }) } as any,
    });

    await orchestrator.run(2);

    const updated = await manager.loadTasks();
    expect(updated.statistics.completed).toBe(2);
    expect(await orchestrator.getStatus()).toMatchObject({ isComplete: true });
    expect(await readFile(join(projectDir, ".harness", "progress.txt"), "utf-8")).toContain("completed");
  });

  it("returns failed evaluations to pending until the retry limit", async () => {
    const manager = new StateManager(projectDir);
    await manager.initializeHarness();
    await manager.saveSpec("# Spec");
    const list = tasks();
    list.tasks = [list.tasks[0]!];
    await manager.saveTasks(list);

    const orchestrator = new Orchestrator(projectDir, {
      providerManager: { initialize: async () => undefined, getAuthStorage: () => ({}), getPIModel: () => ({ provider: "p", id: "m" }), getCurrentProvider: () => ({ model: "m" }), printStatus: () => undefined } as any,
      createPISession: async () => ({ run: async () => ({ success: true, stopReason: "stop", inputTokens: 0, outputTokens: 0 }), dispose: () => undefined, abort: () => undefined }),
      evaluator: { evaluate: async () => ({ summary: "Fail", criteriaResults: [], totalWeightedScore: 0.1, threshold: 0.75, finalDecision: "fail", feedbackForGenerator: "Fix it" }) } as any,
    });

    await orchestrator.run(1);

    const updated = await manager.loadTasks();
    expect(updated.tasks[0]?.status).toBe("pending");
    expect(updated.tasks[0]?.attempts).toBe(1);
  });
});
