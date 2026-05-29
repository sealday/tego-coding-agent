import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const requiredProjectTextFiles = [
  "AGENTS.md",
  "README.md",
  "package.json",
  "tsconfig.json",
  "src/index.ts",
  "prompts/planner-simple.system.md",
  "prompts/generator.system.md",
  "prompts/evaluator.system.md",
];
const promptFiles = readdirSync(join(root, "prompts"))
  .filter((file) => file.endsWith(".md"))
  .map((file) => `prompts/${file}`)
  .sort();

function trackedTextFiles(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf-8" })
    .split("\n")
    .filter(Boolean)
    .filter((file) => !file.startsWith("dist/") && !file.endsWith(".lock"));
}

function read(relative: string): string {
  return readFileSync(join(root, relative), "utf-8");
}

describe("repository documentation and language constraints", () => {
  it("documents the Bun stack and latest PI upstream baseline", () => {
    const readmePath = join(root, "README.md");
    expect(existsSync(readmePath)).toBe(true);
    const readme = readFileSync(readmePath, "utf-8");

    expect(readme).toContain("Bun");
    expect(readme).toContain("@earendil-works/pi-coding-agent");
    expect(readme).toContain("7be8a10d2358fe60f1cf4507140aa9cfa81682ee");
  });

  it("keeps tracked project guidance, prompts, and CLI entry text free of CJK characters", () => {
    const cjk = /[\u3400-\u9FFF\uF900-\uFAFF]/u;
    for (const relative of new Set([...requiredProjectTextFiles, ...promptFiles, ...trackedTextFiles()])) {
      const content = read(relative);
      expect(cjk.test(content), `${relative} contains CJK characters`).toBe(false);
    }
  });

  it("keeps legacy source-project branding out of tracked text and package bins", () => {
    const legacyName = ["autorun", "harness"].join("-");
    const offenders = trackedTextFiles().filter((relative) => read(relative).includes(legacyName));

    expect(offenders).toEqual([]);

    const manifest = JSON.parse(read("package.json"));
    expect(Object.keys(manifest.bin ?? {})).toEqual(["tego-coding-agent"]);
  });

  it("keeps prompt templates aligned with runtime contracts and operational duties", () => {
    const systemPromptContracts: Record<string, string[]> = {
      "prompts/planner-simple.system.md": ["session_progress", ".harness/spec.md", ".harness/tasks.json", ".harness/progress.txt", "dependencies", "statistics"],
      "prompts/planner-full.system.md": ["session_progress", "CLAUDE.md", "docs/PRD.md", "docs/API_CONTRACT.md", ".harness/spec.md", ".harness/tasks.json"],
      "prompts/generator.system.md": ["session_progress", ".harness/spec.md", ".harness/tasks.json", "acceptanceCriteria", "Do not edit `.harness/tasks.json`"],
      "prompts/evaluator.system.md": ["session_progress", "criteriaResults", "totalWeightedScore", "feedbackForGenerator", "Write one JSON report to the requested path"],
    };

    for (const [relative, requiredPhrases] of Object.entries(systemPromptContracts)) {
      const content = read(relative);
      for (const phrase of requiredPhrases) {
        expect(content, `${relative} is missing contract phrase: ${phrase}`).toContain(phrase);
      }
    }

    const userPromptContracts: Record<string, string[]> = {
      "prompts/planner-simple.user.md": ["{{prdContent}}", "{{projectName}}", "{{maxTurns}}", ".harness/tasks.json"],
      "prompts/planner-full.user.md": ["{{prdContent}}", "{{projectName}}", "{{existingDocsInfo}}", "{{maxTurns}}", "docs/PRD.md"],
      "prompts/generator.user.md": ["{{taskJson}}", "{{spec}}", "{{maxTurns}}", "verification"],
      "prompts/evaluator.user.md": ["{{taskJson}}", "{{spec}}", "{{reportPath}}", "{{taskId}}", "{{attempt}}", "criteriaResults"],
    };

    for (const [relative, requiredPhrases] of Object.entries(userPromptContracts)) {
      const content = read(relative);
      for (const phrase of requiredPhrases) {
        expect(content, `${relative} is missing contract phrase: ${phrase}`).toContain(phrase);
      }
    }
  });

  it("keeps prompt examples aligned with the runtime camelCase schema", () => {
    const prompts = promptFiles.map(read).join("\n");
    for (const required of ["createdAt", "acceptanceCriteria", "criteriaResults", "totalWeightedScore", "feedbackForGenerator"]) {
      expect(prompts).toContain(required);
    }
    for (const legacyField of ["created_at", "acceptance_criteria", "criteria_results", "total_weighted_score", "feedback_for_generator"]) {
      expect(prompts).not.toContain(legacyField);
    }
  });
});
