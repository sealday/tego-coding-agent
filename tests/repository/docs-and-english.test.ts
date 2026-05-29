import { describe, expect, it } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const trackedTextFiles = [
  "AGENTS.md",
  "README.md",
  "package.json",
  "tsconfig.json",
  "src/index.ts",
  "prompts/planner-simple.system.md",
  "prompts/generator.system.md",
  "prompts/evaluator.system.md",
];

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
    for (const relative of trackedTextFiles) {
      const content = readFileSync(join(root, relative), "utf-8");
      expect(cjk.test(content), `${relative} contains CJK characters`).toBe(false);
    }
  });
});
