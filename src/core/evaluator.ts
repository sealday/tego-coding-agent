import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createAgentLoader } from "../agents/index.js";
import type { EvaluatorReport, Task } from "../types/index.js";
import { StateManager } from "./state-manager.js";
import { getProviderManager, type ProviderManager } from "./provider-manager.js";
import { createMessageHandler, type MessageHandler } from "./message-handler.js";
import { createPISession, type PISessionOptions } from "./pi-session-wrapper.js";

export interface EvaluatorDeps {
  providerManager?: ProviderManager;
  messageHandler?: MessageHandler;
  createPISession?: (options: PISessionOptions) => ReturnType<typeof createPISession>;
}

export class Evaluator {
  private readonly stateManager: StateManager;
  private readonly agentLoader = createAgentLoader();
  private readonly providerManager: ProviderManager;
  private readonly messageHandler: MessageHandler;
  private readonly createPISession: (options: PISessionOptions) => ReturnType<typeof createPISession>;

  constructor(private readonly projectDir: string, deps: EvaluatorDeps = {}) {
    this.stateManager = new StateManager(projectDir);
    this.providerManager = deps.providerManager ?? getProviderManager();
    this.messageHandler = deps.messageHandler ?? createMessageHandler();
    this.createPISession = deps.createPISession ?? createPISession;
  }

  async evaluate(task: Task, attempt: number): Promise<EvaluatorReport> {
    const reportsDir = join(this.projectDir, ".harness", "reports");
    await mkdir(reportsDir, { recursive: true });
    const reportFileName = `evaluator_report_${task.id}_${attempt}.json`;
    const reportPath = join(".harness", "reports", reportFileName);
    const absoluteReportPath = join(this.projectDir, reportPath);
    const definition = await this.agentLoader.loadEvaluator();
    const spec = await this.stateManager.loadSpec();
    const model = this.providerManager.getPIModel();
    if (!model) throw new Error("No AI provider is configured.");

    const prompt = await this.agentLoader.loadUserPromptTemplate("evaluator.user", {
      taskJson: JSON.stringify(task, null, 2),
      spec,
      reportPath,
      taskId: task.id,
      attempt: String(attempt),
      maxTurns: String(definition.maxTurns),
    });

    const session = await this.createPISession({
      cwd: this.projectDir,
      systemPrompt: definition.prompt,
      tools: definition.tools,
      maxTurns: definition.maxTurns,
      authStorage: this.providerManager.getAuthStorage(),
      model,
      messageHandler: this.messageHandler,
      thinkingLevel: definition.thinkingLevel,
    });
    const result = await session.run(prompt);
    session.dispose();

    if (existsSync(absoluteReportPath)) {
      return normalizeReport(JSON.parse(await readFile(absoluteReportPath, "utf-8")) as Partial<EvaluatorReport>, task, attempt);
    }

    return {
      reportId: `ER-${task.id}-${attempt}`,
      taskId: task.id,
      attempt,
      timestamp: new Date().toISOString(),
      overallResult: result.success ? "pass" : "fail",
      summary: result.success ? "Evaluator finished without writing a report." : (result.error ?? "Evaluator failed."),
      criteriaResults: [],
      totalWeightedScore: result.success ? 0.75 : 0,
      threshold: 0.75,
      finalDecision: result.success ? "pass" : "fail",
      feedbackForGenerator: result.success ? "No evaluator report was written; inspect manually if needed." : (result.error ?? "Evaluator failed."),
      evaluatorError: !result.success,
    };
  }
}

function normalizeReport(report: Partial<EvaluatorReport>, task: Task, attempt: number): EvaluatorReport {
  return {
    reportId: report.reportId ?? `ER-${task.id}-${attempt}`,
    taskId: report.taskId ?? task.id,
    attempt: report.attempt ?? attempt,
    timestamp: report.timestamp ?? new Date().toISOString(),
    overallResult: report.overallResult ?? report.finalDecision ?? "fail",
    summary: report.summary ?? "No summary.",
    criteriaResults: report.criteriaResults ?? [],
    totalWeightedScore: report.totalWeightedScore ?? 0,
    threshold: report.threshold ?? 0.75,
    finalDecision: report.finalDecision ?? (report.overallResult === "pass" ? "pass" : "fail"),
    feedbackForGenerator: report.feedbackForGenerator ?? "",
    evaluatorError: report.evaluatorError ?? false,
  };
}

export function createEvaluator(projectDir: string, deps: EvaluatorDeps = {}): Evaluator {
  return new Evaluator(projectDir, deps);
}
