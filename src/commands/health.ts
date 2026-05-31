import type { Command } from "commander";

import { health } from "../client.js";
import { out, printJson, printProvenance } from "../output.js";
import { buildContext, unwrap } from "./shared.js";

export function registerHealth(program: Command): void {
  program
    .command("health")
    .description("Check Scholar Sidekick service liveness and diagnostics")
    .action(async (_opts, cmd: Command) => {
      const { config, styler } = buildContext(cmd);
      const result = await health(config);
      const data = unwrap(result, styler);

      if (config.json) {
        printJson(data);
      } else {
        const status = data.status ?? (data.ok ? "ok" : "unknown");
        const ok = data.ok !== false && status !== "down";
        out(ok ? styler.green(`✓ ${status}`) : styler.red(`✗ ${status}`));
        out(styler.dim(`Target: ${config.baseUrl}`));
      }
      printProvenance(result.headers, styler, config.quiet);
    });
}
