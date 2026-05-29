import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProviderManager } from "../../src/core/provider-manager.js";

let configDir: string;

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), "tego-providers-"));
});

afterEach(async () => {
  await rm(configDir, { recursive: true, force: true });
});

describe("ProviderManager", () => {
  it("stores provider configuration separately from runtime state", async () => {
    const manager = createProviderManager({ configDir });
    await manager.initialize();

    await manager.addProvider({ name: "primary", authToken: "secret", baseUrl: "https://api.example.com", model: "demo-model" });

    const config = JSON.parse(await readFile(join(configDir, "primary.json"), "utf-8"));
    const state = JSON.parse(await readFile(join(configDir, ".state.json"), "utf-8"));

    expect(config).toEqual({ name: "primary", authToken: "secret", baseUrl: "https://api.example.com", model: "demo-model" });
    expect(config.status).toBeUndefined();
    expect(state.currentProvider).toBe("primary");
  });

  it("switches to an available provider and builds a PI model registry", async () => {
    const manager = createProviderManager({ configDir });
    await manager.initialize();
    await manager.addProvider({ name: "a", authToken: "token-a", baseUrl: "https://a.example.com", model: "model-a" });
    await manager.addProvider({ name: "b", authToken: "token-b", baseUrl: "https://b.example.com", model: "model-b" });

    const result = await manager.switchTo("b");
    const model = manager.getPIModel();

    expect(result).toEqual({ success: true, previousProvider: "a", newProvider: "b" });
    expect(model?.provider).toBe("b");
    expect(model?.id).toBe("model-b");
    expect(manager.getModelRegistry().find("b", "model-b")).toBeDefined();
  });

  it("marks rate-limited providers in runtime state and recovers them after the cooldown", async () => {
    const manager = createProviderManager({ configDir, now: () => new Date("2026-01-01T00:00:00.000Z") });
    await manager.initialize();
    await manager.addProvider({ name: "a", authToken: "token-a", baseUrl: "https://a.example.com", model: "model-a" });
    await manager.addProvider({ name: "b", authToken: "token-b", baseUrl: "https://b.example.com", model: "model-b" });

    const switched = await manager.handleRateLimit();
    expect(switched.newProvider).toBe("b");
    expect(manager.getProviderState("a")?.status).toBe("rate_limited");

    const recovered = createProviderManager({ configDir, now: () => new Date("2026-01-01T02:00:00.000Z") });
    await recovered.initialize();

    expect(recovered.getProviderState("a")?.status).toBe("active");
  });
});
