import type { Command } from "commander";

import { exportCitation } from "../client.js";
import { printJson, printProvenance } from "../output.js";
import { buildContext, joinIds, unwrap } from "./shared.js";

const FORMATS = [
  "bib",
  "ris",
  "csv",
  "csl",
  "endnote-xml",
  "endnote-refer",
  "refworks",
  "medline",
  "zotero-rdf",
  "txt",
];

export function registerExport(program: Command): void {
  program
    .command("export")
    .argument("<ids...>", "one or more identifiers to export")
    .description("Export identifiers to a bibliography file format (BibTeX, RIS, CSL JSON, EndNote, …)")
    .requiredOption("-f, --format <fmt>", `export format: ${FORMATS.join(", ")}`)
    .option("-s, --style <style>", "citation style id (only used when --format txt)")
    .option("--lang <bcp47>", "BCP-47 locale (only used when --format txt)")
    .action(async (ids: string[], opts, cmd: Command) => {
      const { config, styler } = buildContext(cmd);
      const result = await exportCitation(config, {
        text: joinIds(ids),
        format: opts.format,
        style: opts.style,
        lang: opts.lang,
      });
      const content = unwrap(result, styler);

      // The body is the raw file content. --json wraps it so it stays valid JSON.
      if (config.json) {
        printJson({ format: opts.format, content });
      } else {
        // No trailing newline injection — exporters control their own framing.
        process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
      }
      printProvenance(result.headers, styler, config.quiet);
    });
}

export { FORMATS as EXPORT_FORMATS };
