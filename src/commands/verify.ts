import type { Command } from "commander";

import { verifyCitation } from "../client.js";
import { CliError, EXIT, out, printJson, printProvenance, type Styler } from "../output.js";
import type { VerifyApiResponse } from "../types.js";
import { buildContext, unwrap } from "./shared.js";

const ID_FLAGS = ["doi", "pmid", "pmcid", "isbn", "arxiv", "issn", "ads", "whoIris"] as const;

function buildClaimed(opts: Record<string, unknown>): Record<string, unknown> {
  const claimed: Record<string, unknown> = { title: opts.title };
  if (opts.doi) claimed.doi = opts.doi;
  if (opts.pmid) claimed.pmid = opts.pmid;
  if (opts.pmcid) claimed.pmcid = opts.pmcid;
  if (opts.isbn) claimed.isbn = opts.isbn;
  if (opts.arxiv) claimed.arxiv = opts.arxiv;
  if (opts.issn) claimed.issn = opts.issn;
  if (opts.ads) claimed.ads = opts.ads;
  if (opts.whoIris) claimed.whoIrisUrl = opts.whoIris;
  if (opts.year !== undefined) claimed.year = Number(opts.year);
  if (opts.container) claimed.container = opts.container;
  if (opts.author) claimed.authors = [{ family: opts.author }];
  return claimed;
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

function renderVerify(data: VerifyApiResponse, styler: Styler): void {
  const conf = data.confidence ? styler.dim(` (${data.confidence} confidence)`) : "";
  out(`${colorVerdict(data.verdict, styler)}${conf}`);

  const resolvedTitle = (data.matched?.title as string | undefined) ?? null;
  if (resolvedTitle) out(styler.dim(`Resolved: ${resolvedTitle}`));

  if (data.mismatches?.length) {
    out("");
    out(styler.bold("Field mismatches:"));
    for (const m of data.mismatches) {
      const sim = `${Math.round(m.similarity * 100)}%`;
      out(
        `  ${m.field}: claimed ${JSON.stringify(m.claimed)} vs resolved ${JSON.stringify(
          m.resolved,
        )} ${styler.dim(`(${sim} similar)`)}`,
      );
    }
  }
}

export function registerVerify(program: Command): void {
  program
    .command("verify")
    .description("Verify a claimed citation against the record at its identifier (fabrication detection)")
    .requiredOption("--title <title>", "the cited title (required)")
    .option("--doi <doi>", "cited DOI")
    .option("--pmid <pmid>", "cited PMID")
    .option("--pmcid <pmcid>", "cited PMCID")
    .option("--isbn <isbn>", "cited ISBN")
    .option("--arxiv <id>", "cited arXiv id")
    .option("--issn <issn>", "cited ISSN")
    .option("--ads <bibcode>", "cited NASA ADS bibcode")
    .option("--who-iris <url>", "cited WHO IRIS URL")
    .option("--author <family>", "cited first-author family name")
    .option("--year <year>", "cited publication year")
    .option("--container <name>", "cited journal / container title")
    .option("--screen-with-llm", "opt into the Stage 3 LLM screen (paid / first-party only)")
    .option("--fail-on-mismatch", "exit non-zero when the verdict is mismatch or not_found")
    .action(async (opts, cmd: Command) => {
      const { config, styler } = buildContext(cmd);

      if (!ID_FLAGS.some((f) => opts[f])) {
        throw new CliError(
          styler.red("Error: provide at least one identifier (--doi, --pmid, --pmcid, --isbn, --arxiv, --issn, --ads, or --who-iris)"),
          EXIT.USAGE,
        );
      }

      const body: { claimed: Record<string, unknown>; options?: { screen_with_llm?: boolean } } = {
        claimed: buildClaimed(opts),
      };
      if (opts.screenWithLlm) body.options = { screen_with_llm: true };

      const result = await verifyCitation(config, body);
      const data = unwrap(result, styler);

      if (config.json) {
        printJson(data);
      } else {
        renderVerify(data, styler);
      }
      printProvenance(result.headers, styler, config.quiet);

      if (opts.failOnMismatch && (data.verdict === "mismatch" || data.verdict === "not_found")) {
        throw new CliError("", EXIT.API_ERROR);
      }
    });
}
