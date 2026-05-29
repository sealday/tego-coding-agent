import { join } from "node:path";
import { createAgentLoader, type AgentLoader } from "../agents/index.js";
import type { EvaluatorReport, Task } from "../types/index.js";
import { CostTracker, createCostTracker } from "./cost-tracker.js";
import { createEvaluator, type Evaluator } from "./evaluator.js";
import { createMessageHandler, type MessageHandler } from "./message-handler.js";
import { createPISession, type PISessionOptions, type PISessionWrapper } from "./pi-session-wrapper.js";
import { getProviderManager, type ProviderManager } from "./provider-manager.js";
import { StateManager } from "./state-manager.js";

export interface InitializeOptions {
  mode?: "simple" | "full";
  existingDocs?: Record<string, string>;
  prdSource?: string;
}

export interface OrchestratorDeps {
  stateManager?: StateManager;
  agentLoader?: AgentLoader;
  evaluator?: Evaluator;
  providerManager?: ProviderManager;
  messageHandler?: MessageHandler;
  costTracker?: CostTracker;
  createPISession?: (options: PISessionOptions) => Promise<PISessionWrapper>;
}

export class Orchestrator {
  private readonly stateManager: StateManager;
  private readonly agentLoader: AgentLoader;
  private readonly evaluator: Evaluator;
  private readonly providerManager: ProviderManager;
  private readonly messageHandler: MessageHandler;
  private readonly costTracker: CostTracker;
  private readonly createPISession: (options: PISessionOptions) => Promise<PISessionWrapper>;

  constructor(private readonly projectDir: string, deps: OrchestratorDeps = {}) {
    this.stateManager = deps.stateManager ?? new StateManager(projectDir);
    this.agentLoader = deps.agentLoader ?? createAgentLoader();
    this.providerManager = deps.providerManager ?? getProviderManager();
    this.messageHandler = deps.messageHandler ?? createMessageHandler();
    this.evaluator = deps.evaluator ?? createEvaluator(projectDir, { providerManager: this.providerManager, messageHandler: this.messageHandler });
    this.costTracker = deps.costTracker ?? createCostTracker(join(projectDir, ".harness"));
    this.createPISession = deps.createPISession ?? createPISession;
  }

  async initialize(prdContent: string, projectName?: string, options: InitializeOptions = {}): Promise<void> {
    await this.initializeModules();
    const mode = options.mode ?? "full";
    const planner = await this.agentLoader.loadPlanner(mode);
    const model = this.requireModel();
    const prompt = await this.agentLoader.loadUserPromptTemplate(mode === "simple" ? "planner-simple.user" : "planner-full.user", {
      prdContent,
      projectName: projectName ? `Project name: ${projectName}` : "",
      existingDocsInfo: formatExistingDocs(options.existingDocs),
      maxTurns: String(planner.maxTurns),
    });

    const session = await this.createPISession({
      cwd: this.projectDir,
      systemPrompt: planner.prompt,
      tools: planner.tools,
      maxTurns: planner.maxTurns,
      authStorage: this.providerManager.getAuthStorage(),
      model,
      messageHandler: this.messageHandler,
      thinkingLevel: planner.thinkingLevel,
    });
    const result = await session.run(prompt);
    session.dispose();
    await this.recordCost("planner", result.inputTokens, result.outputTokens);
    if (!result.success) throw new Error(result.error ?? `Planner stopped with reason: ${result.stopReason}`);
  }

  async run(maxTasks = 10, maxTokens?: number): Promise<void> {
    await this.initializeModules();
    let completedThisRun = 0;
    let tokensUsedThisRun = 0;

    while (completedThisRun < maxTasks) {
      if (await this.stateManager.isProjectComplete()) break;
      const task = await this.stateManager.getNextPendingTask();
      if (!task) break;
      tokensUsedThisRun += await this.runOneTask(task);
      completedThisRun += 1;
      if (maxTokens !== undefined && tokensUsedThisRun >= maxTokens) break;
    }
  }

  async getStatus(): Promise<{ isComplete: boolean; nextTask: Task | null; statistics: Awaited<ReturnType<StateManager["getStatistics"]>> }> {
    return {
      isComplete: await this.stateManager.isProjectComplete(),
      nextTask: await this.stateManager.getNextPendingTask(),
      statistics: await this.stateManager.getStatistics(),
    };
  }

  private async initializeModules(): Promise<void> {
    await this.stateManager.initializeHarness();
    await this.providerManager.initialize();
    await this.costTracker.initialize();
  }

  private async runOneTask(task: Task): Promise<number> {
    await this.stateManager.updateTaskStatus(task.id, "in_progress");
    await this.stateManager.incrementTaskAttempts(task.id);
    const current = (await this.stateManager.loadTasks()).tasks.find((candidate) => candidate.id === task.id) ?? task;
    const generator = await this.agentLoader.loadGenerator();
    const model = this.requireModel();
    const spec = await this.stateManager.loadSpec();
    const prompt = await this.agentLoader.loadUserPromptTemplate("generator.user", {
      taskJson: JSON.stringify(current, null, 2),
      spec,
      maxTurns: String(generator.maxTurns),
    });

    const session = await this.createPISession({
      cwd: this.projectDir,
      systemPrompt: generator.prompt,
      tools: generator.tools,
      maxTurns: generator.maxTurns,
      authStorage: this.providerManager.getAuthStorage(),
      model,
      messageHandler: this.messageHandler,
      thinkingLevel: generator.thinkingLevel,
    });
    const result = await session.run(prompt);
    session.dispose();
    await this.recordCost("generator", result.inputTokens, result.outputTokens);

    if (!result.success) {
      await this.failOrRetry(current, result.error ?? result.stopReason);
      return result.inputTokens + result.outputTokens;
    }

    const report = await this.evaluator.evaluate(current, current.attempts + 1);
    if (report.finalDecision === "pass") {
      await this.stateManager.updateTaskStatus(current.id, "completed");
      await this.stateManager.appendProgress({ timestamp: new Date().toISOString(), taskId: current.id, status: "completed", details: report.summary });
    } else {
      await this.failOrRetry(current, report.feedbackForGenerator || report.summary, report);
    }
    return result.inputTokens + result.outputTokens;
  }

  private async failOrRetry(task: Task, details: string, report?: EvaluatorReport): Promise<void> {
    const updated = (await this.stateManager.loadTasks()).tasks.find((candidate) => candidate.id === task.id) ?? task;
    const status = updated.attempts >= 3 ? "needs_human" : "pending";
    await this.stateManager.updateTaskStatus(task.id, status);
    await this.stateManager.appendProgress({ timestamp: new Date().toISOString(), taskId: task.id, status, details: report ? `${details} (score ${report.totalWeightedScore})` : details });
  }

  private requireModel() {
    const model = this.providerManager.getPIModel();
    if (!model) throw new Error("No AI provider is configured. Add one with the provider command before running agents.");
    return model;
  }

  private async recordCost(agent: string, inputTokens: number, outputTokens: number): Promise<void> {
    if (inputTokens === 0 && outputTokens === 0) return;
    await this.costTracker.record({
      sessionId: `${agent}-${Date.now()}`,
      agent,
      model: this.providerManager.getCurrentProvider()?.model ?? "unknown",
      inputTokens,
      outputTokens,
    });
  }
}

function formatExistingDocs(existingDocs?: Record<string, string>): string {
  if (!existingDocs || Object.keys(existingDocs).length === 0) return "";
  return ["## Existing documents", ...Object.entries(existingDocs).map(([name, content]) => `### ${name}\n\n${content}`)].join("\n\n");
}
