import { readFile } from "node:fs/promises";

import type { Command } from "commander";

import { formatItems } from "../client.js";
import { CliError, EXIT, out, printJson, printProvenance, printWarnings } from "../output.js";
import { buildContext, renderItems, unwrap } from "./shared.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export function registerFormatItems(program: Command): void {
  program
    .command("format-items")
    .description("Format pre-resolved CSL-JSON items (from --file or stdin) into a citation style")
    .option("--file <path>", "path to a JSON file containing a CSL-JSON array (omit to read stdin)")
    .option("-s, --style <style>", "citation style id (default: vancouver)")
    .option("--lang <bcp47>", "BCP-47 locale tag")
    .option("--footnote", "render as a footnote/note-style citation")
    .option("-o, --output <fmt>", "text | html | json", "text")
    .action(async (opts, cmd: Command) => {
      const { config, styler } = buildContext(cmd);

      const raw = opts.file ? await readFile(opts.file, "utf8") : await readStdin();
      let items: unknown;
      try {
        items = JSON.parse(raw);
      } catch {
        throw new CliError(styler.red("Error: input is not valid JSON"), EXIT.USAGE);
      }
      if (!Array.isArray(items)) {
        throw new CliError(styler.red("Error: expected a JSON array of CSL items"), EXIT.USAGE);
      }

      const result = await formatItems(config, {
        items,
        style: opts.style,
        lang: opts.lang,
        footnote: opts.footnote,
        output: opts.output,
      });
      const data = unwrap(result, styler);

      if (config.json) {
        printJson(data);
      } else if (opts.output === "json") {
        renderItems(data.items ?? [], styler);
      } else if (opts.output === "html") {
        out(data.html ?? "");
      } else {
        out(data.text ?? "");
      }
      if (!config.json) printWarnings(data.warnings, styler);
      printProvenance(result.headers, styler, config.quiet);
    });
}
