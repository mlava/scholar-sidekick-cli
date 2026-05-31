import type { Command } from "commander";

import { formatCitation } from "../client.js";
import { printJson, printProvenance, printWarnings } from "../output.js";
import { buildContext, joinIds, renderItems, unwrap } from "./shared.js";

export function registerResolve(program: Command): void {
  program
    .command("resolve")
    .argument("<ids...>", "one or more identifiers to resolve to structured metadata")
    .description("Resolve identifiers to bibliographic metadata (CSL JSON)")
    .action(async (ids: string[], _opts, cmd: Command) => {
      const { config, styler } = buildContext(cmd);
      const result = await formatCitation(config, { text: joinIds(ids), output: "json" });
      const data = unwrap(result, styler);

      if (config.json) {
        printJson(data.items ?? []);
      } else {
        renderItems(data.items ?? [], styler);
        printWarnings(data.warnings, styler);
      }
      printProvenance(result.headers, styler, config.quiet);
    });
}
