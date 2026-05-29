import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ProviderConfig, ProviderRuntimeState, ProviderStateFile, ProviderSwitchResult } from "../types/quality.js";

const DEFAULT_STATE: ProviderStateFile = { totalSwitches: 0, providers: {} };
const RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000;
const USAGE_LIMIT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface ProviderManagerOptions {
  configDir?: string;
  now?: () => Date;
}

export class ProviderManager {
  private readonly configDir: string;
  private readonly now: () => Date;
  private providers = new Map<string, ProviderConfig>();
  private state: ProviderStateFile = { ...DEFAULT_STATE, providers: {} };
  private authStorage = AuthStorage.inMemory();
  private modelRegistry = ModelRegistry.inMemory(this.authStorage);

  constructor(options: ProviderManagerOptions = {}) {
    this.configDir = options.configDir ?? join(homedir(), ".config", "tego-coding-agent", "providers");
    this.now = options.now ?? (() => new Date());
  }

  async initialize(): Promise<void> {
    await mkdir(this.configDir, { recursive: true });
    this.providers = await this.loadProviderConfigs();
    this.state = await this.loadState();
    this.recoverProviders();

    if (!this.state.currentProvider && this.providers.size > 0) {
      this.state.currentProvider = [...this.providers.keys()][0];
    }

    for (const name of this.providers.keys()) {
      this.state.providers[name] ??= { status: "active" };
    }

    this.configurePiRegistry();
    await this.saveState();
  }

  getConfigDir(): string {
    return this.configDir;
  }

  getProviders(): ProviderConfig[] {
    return [...this.providers.values()];
  }

  getCurrentProvider(): ProviderConfig | undefined {
    return this.state.currentProvider ? this.providers.get(this.state.currentProvider) : undefined;
  }

  getProviderState(name: string): ProviderRuntimeState | undefined {
    return this.state.providers[name];
  }

  getAvailableProviders(): ProviderConfig[] {
    return this.getProviders().filter((provider) => this.getProviderState(provider.name)?.status !== "rate_limited" && this.getProviderState(provider.name)?.status !== "unavailable");
  }

  getAuthStorage(): AuthStorage {
    return this.authStorage;
  }

  getModelRegistry(): ModelRegistry {
    return this.modelRegistry;
  }

  getPIModel(): Model<Api> | undefined {
    const provider = this.getCurrentProvider();
    if (!provider) return undefined;
    return this.modelRegistry.find(provider.name, provider.model);
  }

  async addProvider(config: ProviderConfig): Promise<void> {
    validateProviderConfig(config);
    await mkdir(this.configDir, { recursive: true });
    await writeFile(this.providerPath(config.name), `${JSON.stringify(config, null, 2)}\n`, "utf-8");
    this.providers.set(config.name, config);
    this.state.providers[config.name] = { status: "active" };
    if (!this.state.currentProvider) {
      this.state.currentProvider = config.name;
    }
    this.configurePiRegistry();
    await this.saveState();
  }

  async updateProvider(name: string, updates: Partial<ProviderConfig>): Promise<boolean> {
    const current = this.providers.get(name);
    if (!current) return false;

    const nextName = updates.name ?? current.name;
    const nextConfig: ProviderConfig = {
      ...current,
      ...updates,
      name: nextName,
      authToken: updates.authToken ?? current.authToken,
      baseUrl: updates.baseUrl ?? current.baseUrl,
      model: updates.model ?? current.model,
    };
    validateProviderConfig(nextConfig);

    if (nextName !== name) {
      await rm(this.providerPath(name), { force: true });
      this.providers.delete(name);
      this.state.providers[nextName] = this.state.providers[name] ?? { status: "active" };
      delete this.state.providers[name];
      if (this.state.currentProvider === name) this.state.currentProvider = nextName;
    }

    await writeFile(this.providerPath(nextName), `${JSON.stringify(nextConfig, null, 2)}\n`, "utf-8");
    this.providers.set(nextName, nextConfig);
    this.configurePiRegistry();
    await this.saveState();
    return true;
  }

  async removeProvider(name: string): Promise<void> {
    await rm(this.providerPath(name), { force: true });
    this.providers.delete(name);
    delete this.state.providers[name];
    if (this.state.currentProvider === name) {
      this.state.currentProvider = this.getAvailableProviders()[0]?.name ?? [...this.providers.keys()][0];
    }
    this.configurePiRegistry();
    await this.saveState();
  }

  async switchTo(name: string): Promise<ProviderSwitchResult> {
    if (!this.providers.has(name)) {
      return { success: false, reason: `Provider not found: ${name}`, instructions: "Add the provider before switching to it." };
    }
    const runtime = this.state.providers[name];
    if (runtime?.status === "rate_limited" || runtime?.status === "unavailable") {
      return { success: false, reason: `Provider is not currently available: ${name}`, instructions: "Wait for cooldown recovery or choose another provider." };
    }

    const previousProvider = this.state.currentProvider;
    this.state.currentProvider = name;
    this.state.providers[name] = { status: "active" };
    if (previousProvider !== name) {
      this.state.totalSwitches += 1;
      this.state.lastSwitchAt = this.now().toISOString();
    }
    this.configurePiRegistry();
    await this.saveState();
    return { success: true, previousProvider, newProvider: name };
  }

  async handleRateLimit(): Promise<ProviderSwitchResult> {
    return await this.markCurrentAndSwitch("rate_limited");
  }

  async handleUsageLimit(): Promise<ProviderSwitchResult> {
    return await this.markCurrentAndSwitch("unavailable");
  }

  printStatus(): void {
    const current = this.getCurrentProvider();
    console.log("Providers:");
    if (this.providers.size === 0) {
      console.log("  No providers configured.");
      return;
    }
    for (const provider of this.getProviders()) {
      const marker = provider.name === current?.name ? "*" : " ";
      const status = this.getProviderState(provider.name)?.status ?? "active";
      console.log(` ${marker} ${provider.name} (${provider.model}) - ${status}`);
    }
  }

  async testProvider(name: string): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const started = Date.now();
    if (!this.providers.has(name)) {
      return { success: false, message: `Provider not found: ${name}`, latencyMs: Date.now() - started };
    }
    return { success: true, message: `Provider ${name} is configured.`, latencyMs: Date.now() - started };
  }

  private async markCurrentAndSwitch(status: "rate_limited" | "unavailable"): Promise<ProviderSwitchResult> {
    const current = this.getCurrentProvider();
    if (!current) {
      return { success: false, reason: "No current provider is configured.", instructions: "Add a provider first." };
    }

    const timestamp = this.now().toISOString();
    this.state.providers[current.name] = status === "rate_limited"
      ? { status, rateLimitedAt: timestamp }
      : { status, unavailableAt: timestamp };

    const replacement = this.getAvailableProviders().find((provider) => provider.name !== current.name);
    if (!replacement) {
      await this.saveState();
      return { success: false, previousProvider: current.name, reason: "All providers are limited or unavailable.", instructions: "Add another provider or wait for cooldown recovery." };
    }

    this.state.currentProvider = replacement.name;
    this.state.providers[replacement.name] = { status: "active" };
    this.state.totalSwitches += 1;
    this.state.lastSwitchAt = timestamp;
    this.configurePiRegistry();
    await this.saveState();
    return { success: true, previousProvider: current.name, newProvider: replacement.name };
  }

  private async loadProviderConfigs(): Promise<Map<string, ProviderConfig>> {
    const result = new Map<string, ProviderConfig>();
    const entries = await readdir(this.configDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === ".state.json") continue;
      const raw = await readFile(join(this.configDir, entry.name), "utf-8");
      const config = JSON.parse(raw) as ProviderConfig;
      validateProviderConfig(config);
      result.set(config.name, config);
    }
    return result;
  }

  private async loadState(): Promise<ProviderStateFile> {
    const statePath = join(this.configDir, ".state.json");
    if (!existsSync(statePath)) return { totalSwitches: 0, providers: {} };
    const parsed = JSON.parse(await readFile(statePath, "utf-8")) as ProviderStateFile;
    return { totalSwitches: 0, providers: {}, ...parsed, providers: parsed.providers ?? {} };
  }

  private async saveState(): Promise<void> {
    await writeFile(join(this.configDir, ".state.json"), `${JSON.stringify(this.state, null, 2)}\n`, "utf-8");
  }

  private recoverProviders(): void {
    const now = this.now().getTime();
    for (const [name, runtime] of Object.entries(this.state.providers)) {
      if (runtime.status === "rate_limited" && runtime.rateLimitedAt && now - Date.parse(runtime.rateLimitedAt) >= RATE_LIMIT_COOLDOWN_MS) {
        this.state.providers[name] = { status: "active" };
      }
      if (runtime.status === "unavailable" && runtime.unavailableAt && now - Date.parse(runtime.unavailableAt) >= USAGE_LIMIT_COOLDOWN_MS) {
        this.state.providers[name] = { status: "active" };
      }
    }
  }

  private configurePiRegistry(): void {
    this.authStorage = AuthStorage.inMemory();
    this.modelRegistry = ModelRegistry.inMemory(this.authStorage);

    for (const provider of this.providers.values()) {
      this.authStorage.setRuntimeApiKey(provider.name, provider.authToken);
      this.modelRegistry.registerProvider(provider.name, {
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.authToken,
        api: "anthropic-messages",
        models: [
          {
            id: provider.model,
            name: provider.model,
            api: "anthropic-messages",
            baseUrl: provider.baseUrl,
            reasoning: true,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200_000,
            maxTokens: 8_192,
          },
        ],
      });
    }
  }

  private providerPath(name: string): string {
    return join(this.configDir, `${name}.json`);
  }
}

function validateProviderConfig(config: ProviderConfig): void {
  if (!config.name || !config.authToken || !config.baseUrl || !config.model) {
    throw new Error("Provider requires name, authToken, baseUrl, and model.");
  }
}

let defaultProviderManager: ProviderManager | undefined;

export function createProviderManager(options: ProviderManagerOptions = {}): ProviderManager {
  return new ProviderManager(options);
}

export function getProviderManager(): ProviderManager {
  defaultProviderManager ??= createProviderManager();
  return defaultProviderManager;
}
