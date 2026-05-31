import type { Command } from "commander";

import { formatCitation } from "../client.js";
import { out, printJson, printProvenance, printWarnings } from "../output.js";
import { buildContext, joinIds, renderItems, unwrap } from "./shared.js";

export function registerFormat(program: Command): void {
  program
    .command("format")
    .argument("<ids...>", "one or more identifiers (DOI, PMID, PMCID, ISBN, arXiv, ISSN, ADS, WHO IRIS)")
    .description("Format identifiers into a citation style (Vancouver, APA, AMA, IEEE, CSE, or any CSL style)")
    .option("-s, --style <style>", "citation style id (default: vancouver)")
    .option("--lang <bcp47>", "BCP-47 locale tag (e.g. en-GB)")
    .option("--footnote", "render as a footnote/note-style citation")
    .option("-o, --output <fmt>", "text | html | json", "text")
    .action(async (ids: string[], opts, cmd: Command) => {
      const { config, styler } = buildContext(cmd);
      const result = await formatCitation(config, {
        text: joinIds(ids),
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
