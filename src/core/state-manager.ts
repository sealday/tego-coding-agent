import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProgressEntry, Task, TaskList, TaskStatistics, TaskStatus } from "../types/index.js";

const HARNESS_DIR = ".harness";

export class StateManager {
  readonly projectDir: string;
  readonly harnessDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.harnessDir = join(projectDir, HARNESS_DIR);
  }

  async initializeHarness(): Promise<void> {
    await mkdir(this.harnessDir, { recursive: true });
    await mkdir(join(this.harnessDir, "logs"), { recursive: true });
    await mkdir(join(this.harnessDir, "reports"), { recursive: true });
    await mkdir(join(this.harnessDir, "screenshots"), { recursive: true });
  }

  async saveSpec(content: string): Promise<void> {
    await this.initializeHarness();
    await writeFile(join(this.harnessDir, "spec.md"), content, "utf-8");
  }

  async loadSpec(): Promise<string> {
    return await readFile(join(this.harnessDir, "spec.md"), "utf-8");
  }

  async saveTasks(taskList: TaskList): Promise<void> {
    await this.initializeHarness();
    const normalized: TaskList = {
      ...taskList,
      tasks: taskList.tasks.map(normalizeTask),
      statistics: calculateStatistics(taskList.tasks.map(normalizeTask)),
    };
    await writeFile(join(this.harnessDir, "tasks.json"), `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  }

  async loadTasks(): Promise<TaskList> {
    const raw = await readFile(join(this.harnessDir, "tasks.json"), "utf-8");
    const parsed = JSON.parse(raw) as TaskList;
    const tasks = parsed.tasks.map(normalizeTask);
    return { ...parsed, tasks, statistics: calculateStatistics(tasks) };
  }

  async getNextPendingTask(): Promise<Task | null> {
    const taskList = await this.loadTasks();
    const completed = new Set(taskList.tasks.filter((task) => task.status === "completed").map((task) => task.id));
    return taskList.tasks.find((task) => {
      return task.status === "pending" && task.dependencies.every((dependency) => completed.has(dependency));
    }) ?? null;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const taskList = await this.loadTasks();
    const task = findTaskOrThrow(taskList, taskId);
    task.status = status;
    taskList.statistics = calculateStatistics(taskList.tasks);
    await this.writeTasks(taskList);
  }

  async incrementTaskAttempts(taskId: string): Promise<void> {
    const taskList = await this.loadTasks();
    const task = findTaskOrThrow(taskList, taskId);
    task.attempts += 1;
    await this.writeTasks(taskList);
  }

  async isProjectComplete(): Promise<boolean> {
    const taskList = await this.loadTasks();
    return taskList.tasks.length === 0 || taskList.tasks.every((task) => task.status === "completed");
  }

  async getStatistics(): Promise<TaskStatistics> {
    return (await this.loadTasks()).statistics;
  }

  async appendProgress(entry: ProgressEntry): Promise<void> {
    await this.initializeHarness();
    await appendFile(join(this.harnessDir, "progress.txt"), `${JSON.stringify(entry)}\n`, "utf-8");
  }

  private async writeTasks(taskList: TaskList): Promise<void> {
    const normalized: TaskList = {
      ...taskList,
      tasks: taskList.tasks.map(normalizeTask),
      statistics: calculateStatistics(taskList.tasks),
    };
    await writeFile(join(this.harnessDir, "tasks.json"), `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  }
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    dependencies: task.dependencies ?? [],
    attempts: task.attempts ?? 0,
    acceptanceCriteria: task.acceptanceCriteria ?? [],
  };
}

function findTaskOrThrow(taskList: TaskList, taskId: string): Task {
  const task = taskList.tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return task;
}

export function calculateStatistics(tasks: Task[]): TaskStatistics {
  return {
    total: tasks.length,
    pending: tasks.filter((task) => task.status === "pending").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    completed: tasks.filter((task) => task.status === "completed").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    needsHuman: tasks.filter((task) => task.status === "needs_human").length,
  };
}
