import type { Command } from "commander";

import { checkRetraction } from "../client.js";
import { out, printJson, printProvenance, type Styler } from "../output.js";
import type { RetractionApiResponse } from "../types.js";
import { buildContext, unwrap } from "./shared.js";

function render(data: RetractionApiResponse, styler: Styler): void {
  if (!data.doi) {
    out(styler.dim(`No DOI resolved${data.reason ? ` (${data.reason})` : ""}; nothing to check.`));
    return;
  }
  const r = data.result;
  if (!r) {
    out(styler.dim(`No retraction data for ${data.doi}.`));
    return;
  }
  if (data.result?.title) out(styler.bold(data.result.title));

  if (r.isRetracted) out(styler.red("⚠ RETRACTED"));
  else if (r.hasConcern) out(styler.yellow("⚠ Expression of concern"));
  else if (r.hasCorrections) out(styler.yellow("⚠ Correction issued"));
  else out(styler.green("✓ No retraction, correction, or concern found"));

  for (const n of r.notices ?? []) {
    const bits = [n.label ?? n.type, n.date, n.source].filter(Boolean).join(" · ");
    out(styler.dim(`  ${bits}${n.doi ? `  ${n.doi}` : ""}`));
  }
  out(styler.dim(`DOI ${data.doi}`));
}

export function registerRetraction(program: Command): void {
  program
    .command("retraction")
    .argument("<id>", "a single identifier (DOI, PMID, PMCID, arXiv, or ADS bibcode)")
    .description("Check whether a work has been retracted, corrected, or flagged (Crossref / Retraction Watch)")
    .action(async (id: string, _opts, cmd: Command) => {
      const { config, styler } = buildContext(cmd);
      const result = await checkRetraction(config, { id });
      const data = unwrap(result, styler);
      if (config.json) printJson(data);
      else render(data, styler);
      printProvenance(result.headers, styler, config.quiet);
    });
}
