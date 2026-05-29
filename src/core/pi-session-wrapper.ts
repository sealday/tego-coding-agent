import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  createAgentSession as piCreateAgentSession,
  createExtensionRuntime,
  defineTool,
  SessionManager,
  SettingsManager,
  type AgentSessionEvent,
  type CreateAgentSessionOptions,
  type CreateAgentSessionResult,
  type ResourceLoader,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type, type Model } from "@earendil-works/pi-ai";
import type { AuthStorage } from "@earendil-works/pi-coding-agent";

export interface MessageHandlerLike {
  reset(): void;
  handleToolStart(toolName: string, args: Record<string, unknown>): void;
  handleToolEnd(toolName: string, isError: boolean): void;
  handleSessionEvent(event: Record<string, unknown>): void;
}

export interface PISessionOptions {
  cwd: string;
  systemPrompt: string;
  tools: string[];
  maxTurns: number;
  authStorage: AuthStorage;
  model: Model<any>;
  messageHandler: MessageHandlerLike;
  thinkingLevel?: "off" | "low" | "medium" | "high" | "xhigh";
  customTools?: ToolDefinition[];
  agentDir?: string;
}

export interface PISessionResult {
  success: boolean;
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

export interface PISessionWrapper {
  run(prompt: string): Promise<PISessionResult>;
  abort(): void;
  dispose(): void;
}

export interface PISessionDeps {
  createAgentSession?: (options: CreateAgentSessionOptions) => Promise<CreateAgentSessionResult>;
}

interface TurnTracker {
  current: number;
  max: number;
}

export async function createPISession(options: PISessionOptions, deps: PISessionDeps = {}): Promise<PISessionWrapper> {
  const agentDir = options.agentDir ?? join(process.env.HOME ?? process.cwd(), ".pi", "agent");
  const systemPrompt = await buildSystemPrompt(options.cwd, options.systemPrompt);
  const turnTracker: TurnTracker = { current: 0, max: options.maxTurns };
  const progressTool = createProgressTool(turnTracker);
  const resourceLoader = createStaticResourceLoader(systemPrompt);
  const createAgentSession = deps.createAgentSession ?? piCreateAgentSession;

  const result = await createAgentSession({
    cwd: options.cwd,
    agentDir,
    model: options.model,
    thinkingLevel: options.thinkingLevel ?? "high",
    tools: [...options.tools, "session_progress"],
    customTools: [progressTool, ...(options.customTools ?? [])],
    authStorage: options.authStorage,
    sessionManager: SessionManager.inMemory(options.cwd),
    settingsManager: SettingsManager.inMemory({ retry: { enabled: true, maxRetries: 2 } }),
    resourceLoader,
  });

  const session = result.session;
  session.setAutoCompactionEnabled?.(true);
  session.setAutoRetryEnabled?.(true);

  let startMessageCount = 0;
  let resolveRun: ((value: PISessionResult) => void) | undefined;

  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "tool_execution_start") {
      options.messageHandler.handleToolStart(event.toolName, event.args as Record<string, unknown>);
    }
    if (event.type === "tool_execution_end") {
      options.messageHandler.handleToolEnd(event.toolName, event.isError);
    }
    if (event.type === "turn_start") {
      options.messageHandler.handleSessionEvent({ type: "turn_start" });
    }
    if (event.type === "turn_end") {
      turnTracker.current += 1;
      if (turnTracker.current >= turnTracker.max) {
        void session.abort();
      }
      options.messageHandler.handleSessionEvent({ type: "turn_end", current: turnTracker.current, max: turnTracker.max });
    }
    if (event.type === "compaction_start") {
      options.messageHandler.handleSessionEvent({ type: "compaction_start", reason: event.reason });
    }
    if (event.type === "compaction_end") {
      options.messageHandler.handleSessionEvent({ type: "compaction_end", aborted: event.aborted, willRetry: event.willRetry });
    }
    if (event.type === "auto_retry_start") {
      options.messageHandler.handleSessionEvent({ type: "auto_retry_start", attempt: event.attempt, maxAttempts: event.maxAttempts });
    }
    if (event.type === "auto_retry_end") {
      options.messageHandler.handleSessionEvent({ type: "auto_retry_end", success: event.success, attempt: event.attempt });
    }
    if (event.type === "agent_end" && resolveRun) {
      const messages = session.agent.state.messages.slice(startMessageCount) as any[];
      const usage = collectUsage(messages);
      const lastAssistant = [...session.agent.state.messages].reverse().find((message: any) => message.role === "assistant") as any;
      const stopReason = lastAssistant?.stopReason ?? "unknown";
      const success = stopReason === "stop" || stopReason === "toolUse" || stopReason === "end_turn";
      const resolver = resolveRun;
      resolveRun = undefined;
      resolver({
        success,
        stopReason,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        error: success ? undefined : `Agent stopped with reason: ${stopReason}`,
      });
    }
  });

  return {
    run(prompt: string): Promise<PISessionResult> {
      turnTracker.current = 0;
      startMessageCount = session.agent.state.messages.length;
      options.messageHandler.reset();

      return new Promise((resolve) => {
        resolveRun = resolve;
        session.prompt(prompt).catch((error: unknown) => {
          if (!resolveRun) return;
          const resolver = resolveRun;
          resolveRun = undefined;
          resolver({
            success: false,
            stopReason: "error",
            inputTokens: 0,
            outputTokens: 0,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      });
    },
    abort(): void {
      void session.abort();
    },
    dispose(): void {
      unsubscribe?.();
      session.dispose();
    },
  };
}

function createProgressTool(tracker: TurnTracker): ToolDefinition {
  return defineTool({
    name: "session_progress",
    label: "Session Progress",
    description: "Reports the current PI session turn budget and remaining turns.",
    promptSnippet: "Check turn usage and remaining turns.",
    parameters: Type.Object({}),
    async execute() {
      const remaining = Math.max(0, tracker.max - tracker.current);
      return {
        content: [{ type: "text", text: `Used ${tracker.current}/${tracker.max} turns; ${remaining} turns remaining.` }],
        details: { current: tracker.current, max: tracker.max, remaining },
      };
    },
  });
}

async function buildSystemPrompt(cwd: string, systemPrompt: string): Promise<string> {
  const contextParts: string[] = [];
  for (const file of ["AGENTS.md", "CLAUDE.md"]) {
    const filePath = join(cwd, file);
    if (!existsSync(filePath)) continue;
    const content = await readFile(filePath, "utf-8");
    if (content.trim()) {
      contextParts.push(`<!-- Project context: ${file} -->\n\n${content.trim()}`);
    }
  }
  return contextParts.length > 0 ? `${contextParts.join("\n\n")}\n\n---\n\n${systemPrompt}` : systemPrompt;
}

function collectUsage(messages: any[]): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const message of messages) {
    if (message.role !== "assistant" || !message.usage) continue;
    inputTokens += message.usage.input ?? message.usage.input_tokens ?? 0;
    outputTokens += message.usage.output ?? message.usage.output_tokens ?? 0;
  }
  return { inputTokens, outputTokens };
}

function createStaticResourceLoader(systemPrompt: string): ResourceLoader {
  const runtime = createExtensionRuntime();
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}
