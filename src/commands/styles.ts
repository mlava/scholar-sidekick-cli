import type { Command } from "commander";

import { listStyles } from "../client.js";
import { out, printJson, printProvenance, type Styler } from "../output.js";
import type { StylesApiResponse } from "../types.js";
import { buildContext, unwrap } from "./shared.js";

function render(data: StylesApiResponse, styler: Styler): void {
  const styles = data.styles ?? [];
  if (data.categories) {
    out(styler.bold("Categories:"));
    for (const c of data.categories) out(`  ${c}`);
    return;
  }
  if (styles.length === 0) {
    out(styler.dim("No styles matched."));
    return;
  }
  for (const s of styles) {
    const flag = s.bundled ? styler.green("●") : styler.dim("○");
    out(`${flag} ${styler.bold(s.id)}${s.title ? styler.dim(`  — ${s.title}`) : ""}`);
  }
  const total = data.total ?? styles.length;
  const offset = data.offset ?? 0;
  out("");
  out(styler.dim(`Showing ${styles.length} of ${total} (offset ${offset}). ● bundled  ○ remote`));
}

export function registerStyles(program: Command): void {
  program
    .command("styles")
    .argument("[query]", "optional search term to filter styles by id/title")
    .description("List available CSL citation styles (searchable, paginated)")
    .option("--category <name>", "filter by category (e.g. medicine, science)")
    .option("--bundled", "only show bundled (always-available) styles")
    .option("--limit <n>", "max results (0 = all)", "50")
    .option("--offset <n>", "pagination offset", "0")
    .option("--no-remote", "exclude remote styles even when imports are enabled")
    .option("--categories", "list available categories instead of styles")
    .action(async (query: string | undefined, opts, cmd: Command) => {
      const { config, styler } = buildContext(cmd);
      const result = await listStyles(config, {
        q: query,
        category: opts.category,
        bundled: opts.bundled ? "true" : undefined,
        limit: opts.limit,
        offset: opts.offset,
        // commander sets remote:false for --no-remote
        remote: opts.remote === false ? "0" : undefined,
        categories: opts.categories ? "1" : undefined,
      });
      const data = unwrap(result, styler);
      if (config.json) printJson(data);
      else render(data, styler);
      printProvenance(result.headers, styler, config.quiet);
    });
}
