import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initCommand } from "../../src/commands/init.js";
import { providerCommand } from "../../src/commands/provider.js";
import { runCommand } from "../../src/commands/run.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "tego-cli-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("CLI commands", () => {
  it("initializes a simple project from text with English output", async () => {
    const calls: any[] = [];
    await initCommand(join(tempDir, "app"), { mode: "simple", text: "Build a todo app", name: "Todo" }, {
      createOrchestrator(projectDir) {
        return { initialize: async (...args: any[]) => calls.push({ projectDir, args }) } as any;
      },
      runGitInit: async () => undefined,
      log: () => undefined,
      error: () => undefined,
      exit: (code) => { throw new Error(`exit ${code}`); },
    });

    expect(calls[0].args[0]).toContain("Build a todo app");
    expect(calls[0].args[1]).toBe("Todo");
    expect(calls[0].args[2].mode).toBe("simple");
  });

  it("requires an input source in simple init mode", async () => {
    await expect(initCommand(join(tempDir, "app"), { mode: "simple" }, {
      createOrchestrator() { throw new Error("should not construct orchestrator"); },
      runGitInit: async () => undefined,
      log: () => undefined,
      error: () => undefined,
      exit: (code) => { throw new Error(`exit ${code}`); },
    })).rejects.toThrow("exit 1");
  });

  it("runs an initialized project with parsed numeric limits", async () => {
    const projectDir = join(tempDir, "project");
    await mkdir(join(projectDir, ".harness"), { recursive: true });
    await Bun.write(join(projectDir, ".harness", "tasks.json"), "{}");
    const runCalls: any[] = [];

    await runCommand(projectDir, { maxTasks: "5", maxTokens: "1000" }, {
      createOrchestrator() {
        return {
          run: async (...args: any[]) => runCalls.push(args),
          getStatus: async () => ({ isComplete: true, nextTask: null, statistics: { total: 0, pending: 0, inProgress: 0, completed: 0, blocked: 0, needsHuman: 0 } }),
        } as any;
      },
      log: () => undefined,
      error: () => undefined,
      exit: (code) => { throw new Error(`exit ${code}`); },
    });

    expect(runCalls).toEqual([[5, 1000]]);
  });

  it("manages providers through the provider command", async () => {
    const configDir = join(tempDir, "providers");
    await providerCommand({ add: true, name: "p", token: "token", url: "https://api.example.com", model: "m" }, { configDir, log: () => undefined, error: () => undefined, exit: (code) => { throw new Error(`exit ${code}`); } });
    await providerCommand({ switch: "p" }, { configDir, log: () => undefined, error: () => undefined, exit: (code) => { throw new Error(`exit ${code}`); } });

    const config = JSON.parse(await readFile(join(configDir, "p.json"), "utf-8"));
    expect(config.model).toBe("m");
  });
});
