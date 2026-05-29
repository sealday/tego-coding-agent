import { SyncEngine } from "../core/sync-engine.js";
import type { SyncCommandOptions } from "../types/index.js";

export async function syncCommand(projectDir: string, options: SyncCommandOptions): Promise<void> {
  const engine = new SyncEngine(projectDir, {
    checkOnly: !options.fix,
    autoFix: !!options.fix,
    docsDir: options.docs ?? "docs",
  });
  const report = await engine.sync();
  console.log(`Sync mode: ${report.mode}`);
  console.log(`Features: ${report.summary.totalFeatures}`);
  console.log(`Discrepancies: ${report.summary.discrepancies}`);
  if (report.summary.autoFixed > 0) console.log(`Auto-fixed: ${report.summary.autoFixed}`);
  if (report.summary.discrepancies > 0 && !options.fix) process.exitCode = 1;
}
