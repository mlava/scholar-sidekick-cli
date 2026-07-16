import { readFile } from "node:fs/promises";

import type { Command } from "commander";

import { auditBibliography } from "../client.js";
import { CliError, EXIT, out, printJson, printProvenance, type Styler } from "../output.js";
import type { AuditApiResponse, AuditEntry } from "../types.js";
import { buildContext, unwrap } from "./shared.js";

const FORMATS = ["bibtex", "ris", "csl-json"] as const;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const VERDICT_LABEL: Record<string, string> = {
  matched: "✓ MATCHED",
  mismatch: "✗ MISMATCH",
  ambiguous: "? AMBIGUOUS",
  not_found: "· NOT FOUND",
};

function colorVerdict(verdict: string | undefined, styler: Styler): string {
  const label = VERDICT_LABEL[verdict ?? ""] ?? (verdict ?? "unknown").toUpperCase();
  switch (verdict) {
    case "matched":
      return styler.green(label);
    case "mismatch":
      return styler.red(label);
    case "ambiguous":
      return styler.yellow(label);
    default:
      return styler.dim(label);
  }
}

function retractionFlag(entry: AuditEntry, styler: Styler): string {
  const r = entry.retraction;
  if (!r?.checked) return "";
  if (r.isRetracted) return `  ${styler.red("⚠ RETRACTED")}`;
  if (r.hasConcern) return `  ${styler.yellow("⚠ expression of concern")}`;
  if (r.hasCorrections) return `  ${styler.yellow("⚠ correction issued")}`;
  return "";
}

function renderEntry(entry: AuditEntry, styler: Styler): void {
  const key = entry.sourceKey ? `${styler.cyan(entry.sourceKey)}  ` : "";
  // Entry indices are 1-based in the API contract.
  const num = styler.dim(`${entry.index}.`);

  if (entry.status === "error") {
    out(`${num} ${key}${styler.red("! ERROR")}  ${styler.dim(entry.error ?? "entry failed")}`);
    return;
  }

  const conf = entry.confidence ? styler.dim(` (${entry.confidence})`) : "";
  out(`${num} ${key}${colorVerdict(entry.verdict, styler)}${conf}${retractionFlag(entry, styler)}`);

  const resolvedTitle = (entry.matched?.title as string | undefined) ?? null;
  if (resolvedTitle) out(styler.dim(`   ${resolvedTitle}`));

  for (const m of entry.mismatches ?? []) {
    const sim = `${Math.round(m.similarity * 100)}%`;
    out(
      `   ${m.field}: claimed ${JSON.stringify(m.claimed)} vs resolved ${JSON.stringify(
        m.resolved,
      )} ${styler.dim(`(${sim} similar)`)}`,
    );
  }
}

function renderAudit(data: AuditApiResponse, styler: Styler): void {
  for (const entry of data.entries ?? []) renderEntry(entry, styler);

  for (const p of data.parseErrors ?? []) {
    out(styler.yellow(`! parse error at entry ${p.index}: ${p.message}`));
  }
  if (data.truncated) {
    out(styler.yellow(`! ${data.truncated} entr${data.truncated === 1 ? "y" : "ies"} beyond the 25-entry cap were dropped`));
  }

  const s = data.summary;
  if (!s) return;
  const parts = [
    s.matched > 0 ? styler.green(`matched ${s.matched}`) : `matched ${s.matched}`,
    s.mismatch > 0 ? styler.red(`mismatch ${s.mismatch}`) : `mismatch ${s.mismatch}`,
    s.ambiguous > 0 ? styler.yellow(`ambiguous ${s.ambiguous}`) : `ambiguous ${s.ambiguous}`,
    `not found ${s.not_found}`,
    `errored ${s.errored}`,
    s.retracted > 0 ? styler.red(`retracted ${s.retracted}`) : `retracted ${s.retracted}`,
  ];
  out("");
  out(`${styler.bold(`${s.total} entries:`)} ${parts.join("  ·  ")}`);
}

export function registerAudit(program: Command): void {
  program
    .command("audit")
    .argument("[file]", "path to a bibliography file — BibTeX, RIS, or CSL-JSON (omit to read stdin)")
    .description("Audit a whole bibliography: per-entry fabrication check + retraction status, plus a corpus summary")
    .option("--format <fmt>", "override format auto-detection: bibtex | ris | csl-json")
    .option("--no-retraction", "skip the per-entry retraction check")
    .option("--screen-with-llm", "opt into the Stage 3 LLM screen per entry (paid / first-party only)")
    .option("--fail-on-issues", "exit non-zero when any entry is mismatch, not_found, or retracted")
    .action(async (file: string | undefined, opts, cmd: Command) => {
      const { config, styler } = buildContext(cmd);

      if (opts.format && !FORMATS.includes(opts.format)) {
        throw new CliError(
          styler.red(`Error: unknown --format '${opts.format}' (expected bibtex, ris, or csl-json)`),
          EXIT.USAGE,
        );
      }

      const raw = file ? await readFile(file, "utf8") : await readStdin();
      if (!raw.trim()) {
        throw new CliError(styler.red("Error: bibliography input is empty"), EXIT.USAGE);
      }

      const body: {
        bibliography: string;
        format?: string;
        options?: { screen_with_llm?: boolean; checks?: string[] };
      } = { bibliography: raw };
      if (opts.format) body.format = opts.format;

      const options: { screen_with_llm?: boolean; checks?: string[] } = {};
      // commander negates --no-retraction into retraction:false; default true.
      if (opts.retraction === false) options.checks = [];
      if (opts.screenWithLlm) options.screen_with_llm = true;
      if (Object.keys(options).length) body.options = options;

      const result = await auditBibliography(config, body);
      const data = unwrap(result, styler);

      if (config.json) {
        printJson(data);
      } else {
        renderAudit(data, styler);
      }
      printProvenance(result.headers, styler, config.quiet);

      const s = data.summary;
      if (opts.failOnIssues && s && (s.mismatch > 0 || s.not_found > 0 || s.retracted > 0)) {
        throw new CliError("", EXIT.API_ERROR);
      }
    });
}
