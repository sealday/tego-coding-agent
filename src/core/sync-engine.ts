import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SyncDiscrepancy, SyncEngineOptions, SyncReport, Task } from "../types/index.js";
import { StateManager } from "./state-manager.js";

interface DocFeature {
  title: string;
  source: string;
  description: string;
}

export class SyncEngine {
  private readonly stateManager: StateManager;

  constructor(private readonly projectDir: string, private readonly options: SyncEngineOptions) {
    this.stateManager = new StateManager(projectDir);
  }

  async sync(): Promise<SyncReport> {
    const features = await this.extractFeatures();
    const taskList = await this.stateManager.loadTasks();
    const discrepancies = this.findDiscrepancies(features, taskList.tasks);
    const fixes = [];

    if (this.options.autoFix) {
      for (const discrepancy of discrepancies.filter((item) => item.type === "doc_without_task" && item.autoFixable)) {
        const feature = features.find((candidate) => candidate.title === discrepancy.featureTitle);
        if (!feature) continue;
        taskList.tasks.push(featureToTask(feature, taskList.tasks.length + 1));
        fixes.push({ discrepancyId: discrepancy.id, applied: true, description: `Added task for ${feature.title}` });
      }
      if (fixes.length > 0) await this.stateManager.saveTasks(taskList);
    }

    return {
      mode: this.options.autoFix ? "fix" : "check",
      summary: {
        totalFeatures: features.length,
        alignedFeatures: Math.max(0, features.length - discrepancies.length),
        discrepancies: discrepancies.length,
        bySeverity: {
          high: discrepancies.filter((item) => item.severity === "high").length,
          medium: discrepancies.filter((item) => item.severity === "medium").length,
          low: discrepancies.filter((item) => item.severity === "low").length,
        },
        autoFixed: fixes.filter((fix) => fix.applied).length,
        needsReview: discrepancies.filter((item) => !item.autoFixable).length,
      },
      discrepancies,
      fixes,
    };
  }

  private async extractFeatures(): Promise<DocFeature[]> {
    const docsPath = join(this.projectDir, this.options.docsDir);
    const entries = await readdir(docsPath, { withFileTypes: true }).catch(() => []);
    const features: DocFeature[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const source = join(this.options.docsDir, entry.name);
      const content = await readFile(join(this.projectDir, source), "utf-8");
      features.push(...parseMarkdownFeatures(content, source));
    }

    return features;
  }

  private findDiscrepancies(features: DocFeature[], tasks: Task[]): SyncDiscrepancy[] {
    const taskText = tasks.map((task) => `${task.title}\n${task.description}`.toLowerCase()).join("\n");
    return features
      .filter((feature) => !taskText.includes(feature.title.toLowerCase()))
      .map((feature, index) => ({
        id: `D${String(index + 1).padStart(3, "0")}`,
        type: "doc_without_task",
        severity: "medium",
        description: `Documented feature has no matching task: ${feature.title}`,
        featureTitle: feature.title,
        autoFixable: true,
        fixAction: { kind: "add_task", description: `Create a pending task for ${feature.title}` },
      } satisfies SyncDiscrepancy));
  }
}

function parseMarkdownFeatures(content: string, source: string): DocFeature[] {
  const lines = content.split(/\r?\n/);
  const features: DocFeature[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^##\s+(.+)$/.exec(lines[index] ?? "");
    if (!match) continue;
    const title = match[1]?.trim();
    if (!title || title.toLowerCase().includes("overview")) continue;
    const descriptionLines: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      if (/^##\s+/.test(lines[next] ?? "")) break;
      if ((lines[next] ?? "").trim()) descriptionLines.push((lines[next] ?? "").trim());
    }
    features.push({ title, source, description: descriptionLines.join("\n") });
  }
  return features;
}

function featureToTask(feature: DocFeature, ordinal: number): Task {
  return {
    id: `SYNC-${String(ordinal).padStart(3, "0")}`,
    title: feature.title,
    description: feature.description || `Implement documented feature from ${feature.source}.`,
    status: "pending",
    dependencies: [],
    attempts: 0,
    acceptanceCriteria: [{ id: "AC001", description: `Feature is implemented: ${feature.title}`, steps: ["Run relevant tests and verify the documented behavior."] }],
  };
}
