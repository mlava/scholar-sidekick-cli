import type { Command } from "commander";

import { checkOpenAccess } from "../client.js";
import { out, printJson, printProvenance, type Styler } from "../output.js";
import type { OaApiResponse } from "../types.js";
import { buildContext, unwrap } from "./shared.js";

function render(data: OaApiResponse, styler: Styler): void {
  if (!data.doi) {
    out(styler.dim(`No DOI resolved${data.reason ? ` (${data.reason})` : ""}; cannot check OA.`));
    return;
  }
  const r = data.result;
  if (!r) {
    out(styler.dim(`No open-access data for ${data.doi}.`));
    return;
  }
  if (r.title) out(styler.bold(r.title));

  if (r.isOa) out(styler.green(`✓ Open access (${r.oaStatus})`));
  else out(styler.dim(`✗ Closed (${r.oaStatus})`));

  const best = r.bestLocation;
  if (best) {
    out(`Best copy: ${styler.cyan(best.url)}`);
    const meta = [best.version, best.license, best.hostType].filter(Boolean).join(" · ");
    if (meta) out(styler.dim(`  ${meta}`));
  }
  out(styler.dim(`DOI ${data.doi}`));
}

export function registerOa(program: Command): void {
  program
    .command("oa")
    .alias("open-access")
    .argument("<id>", "a single identifier (DOI, PMID, PMCID, arXiv, ISBN, or ADS bibcode)")
    .description("Check whether a work is openly accessible and where to find the best legal copy (Unpaywall)")
    .action(async (id: string, _opts, cmd: Command) => {
      const { config, styler } = buildContext(cmd);
      const result = await checkOpenAccess(config, { id });
      const data = unwrap(result, styler);
      if (config.json) printJson(data);
      else render(data, styler);
      printProvenance(result.headers, styler, config.quiet);
    });
}
