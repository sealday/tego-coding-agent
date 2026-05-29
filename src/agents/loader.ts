import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AgentDefinition {
  description: string;
  prompt: string;
  tools: string[];
  maxTurns: number;
  thinkingLevel: "off" | "low" | "medium" | "high" | "xhigh";
}

export class AgentLoader {
  constructor(private readonly promptsDir = join(__dirname, "../../prompts")) {}

  async loadPlanner(mode: "simple" | "full" = "full"): Promise<AgentDefinition> {
    return {
      description: "Planner agent that converts requirements into specifications and executable tasks.",
      prompt: await this.loadPrompt(mode === "simple" ? "planner-simple.system" : "planner-full.system"),
      tools: ["read", "write", "edit", "bash", "grep", "find", "ls"],
      maxTurns: mode === "simple" ? 12 : 24,
      thinkingLevel: "high",
    };
  }

  async loadGenerator(): Promise<AgentDefinition> {
    return {
      description: "Generator agent that implements one task according to the specification.",
      prompt: await this.loadPrompt("generator.system"),
      tools: ["read", "write", "edit", "bash", "grep", "find", "ls"],
      maxTurns: 30,
      thinkingLevel: "high",
    };
  }

  async loadEvaluator(): Promise<AgentDefinition> {
    return {
      description: "Evaluator agent that verifies acceptance criteria and writes a structured report.",
      prompt: await this.loadPrompt("evaluator.system"),
      tools: ["read", "bash", "grep", "find", "ls"],
      maxTurns: 18,
      thinkingLevel: "high",
    };
  }

  async loadUserPromptTemplate(name: string, slots: Record<string, string> = {}): Promise<string> {
    let template = await this.loadPrompt(name);
    for (const [key, value] of Object.entries(slots)) {
      template = template.replaceAll(`{{${key}}}`, value);
    }
    return template;
  }

  private async loadPrompt(name: string): Promise<string> {
    return await readFile(join(this.promptsDir, `${name}.md`), "utf-8");
  }
}

export function createAgentLoader(promptsDir?: string): AgentLoader {
  return new AgentLoader(promptsDir);
}
