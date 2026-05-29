import ora from "ora";
import { createProviderManager } from "../core/provider-manager.js";
import type { ProviderConfig } from "../types/quality.js";

export interface ProviderCommandOptions {
  list?: boolean;
  add?: boolean;
  edit?: string;
  switch?: string;
  remove?: string;
  test?: string;
  name?: string;
  token?: string;
  url?: string;
  model?: string;
}

export interface ProviderCommandDeps {
  configDir?: string;
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  exit?: (code: number) => never | void;
}

export async function providerCommand(options: ProviderCommandOptions, deps: ProviderCommandDeps = {}): Promise<void> {
  const log = deps.log ?? console.log;
  const error = deps.error ?? console.error;
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const manager = createProviderManager({ configDir: deps.configDir });
  await manager.initialize();

  if (options.list) {
    manager.printStatus();
    return;
  }

  if (options.add) {
    if (!options.name || !options.token || !options.url || !options.model) {
      error("Adding a provider requires --name, --token, --url, and --model.");
      exit(1);
      return;
    }
    await manager.addProvider({ name: options.name, authToken: options.token, baseUrl: options.url, model: options.model });
    log(`Added provider: ${options.name}`);
    return;
  }

  if (options.edit) {
    const updates: Partial<ProviderConfig> = {};
    if (options.name) updates.name = options.name;
    if (options.token) updates.authToken = options.token;
    if (options.url) updates.baseUrl = options.url;
    if (options.model) updates.model = options.model;
    if (Object.keys(updates).length === 0) {
      error("Editing a provider requires at least one of --name, --token, --url, or --model.");
      exit(1);
      return;
    }
    const ok = await manager.updateProvider(options.edit, updates);
    if (!ok) {
      error(`Provider not found: ${options.edit}`);
      exit(1);
      return;
    }
    log(`Updated provider: ${options.edit}`);
    return;
  }

  if (options.remove) {
    await manager.removeProvider(options.remove);
    log(`Removed provider: ${options.remove}`);
    return;
  }

  if (options.switch) {
    const result = await manager.switchTo(options.switch);
    if (!result.success) {
      error(result.reason ?? "Provider switch failed.");
      if (result.instructions) error(result.instructions);
      exit(1);
      return;
    }
    log(`Switched provider: ${result.newProvider}`);
    return;
  }

  if (options.test) {
    const spinner = ora({ text: `Testing provider ${options.test}...`, isEnabled: deps.log === undefined }).start();
    const result = await manager.testProvider(options.test);
    spinner.stop();
    if (!result.success) {
      error(result.message);
      exit(1);
      return;
    }
    log(result.message);
    return;
  }

  manager.printStatus();
  log(`Config directory: ${manager.getConfigDir()}`);
}
