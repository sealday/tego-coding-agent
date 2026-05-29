import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPISession } from "../../src/core/pi-session-wrapper.js";

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "tego-pi-"));
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

describe("createPISession", () => {
  it("injects English project context and the session progress tool", async () => {
    await writeFile(join(projectDir, "AGENTS.md"), "# Project Rules\n\nUse Bun only.\n", "utf-8");
    let capturedOptions: any;
    let listener: ((event: any) => void) | undefined;

    const wrapper = await createPISession(
      {
        cwd: projectDir,
        systemPrompt: "You are the generator.",
        tools: ["read", "bash"],
        maxTurns: 3,
        authStorage: {} as any,
        model: { provider: "p", id: "m" } as any,
        messageHandler: { reset() {}, handleToolStart() {}, handleToolEnd() {}, handleSessionEvent() {} },
      },
      {
        createAgentSession: (async (options: any) => {
          capturedOptions = options;
          const session = {
            agent: { state: { messages: [] as any[] } },
            subscribe(fn: (event: any) => void) { listener = fn; return () => {}; },
            prompt: async () => {
              const assistant = { role: "assistant", stopReason: "stop", usage: { input: 7, output: 11 } };
              session.agent.state.messages.push(assistant);
              listener?.({ type: "agent_end", messages: [assistant], willRetry: false });
            },
            abort() {},
            dispose() {},
            setAutoCompactionEnabled() {},
            setAutoRetryEnabled() {},
          };
          return {
            session,
            extensionsResult: { extensions: [], errors: [], runtime: {} },
          };
        }) as any,
      },
    );

    const result = await wrapper.run("Implement the task.");
    const prompt = capturedOptions.resourceLoader.getSystemPrompt();

    expect(prompt).toContain("Project context: AGENTS.md");
    expect(prompt).toContain("Use Bun only.");
    expect(capturedOptions.tools).toEqual(["read", "bash", "session_progress"]);
    expect(capturedOptions.customTools.some((tool: any) => tool.name === "session_progress")).toBe(true);
    expect(result).toMatchObject({ success: true, stopReason: "stop", inputTokens: 7, outputTokens: 11 });
  });
});
