import { Command } from "commander";

import { registerExport } from "./commands/export.js";
import { registerFormat } from "./commands/format.js";
import { registerFormatItems } from "./commands/format-items.js";
import { registerHealth } from "./commands/health.js";
import { registerOa } from "./commands/oa.js";
import { registerResolve } from "./commands/resolve.js";
import { registerRetraction } from "./commands/retraction.js";
import { registerStream } from "./commands/stream.js";
import { registerStyles } from "./commands/styles.js";
import { registerVerify } from "./commands/verify.js";
import { VERSION } from "./version.js";

/** Build the root commander program with every subcommand registered. */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name("scholar")
    .description(
      "Scholar Sidekick CLI — resolve, format, export, and verify scholarly citations.\n\n" +
        "Calls the public Scholar Sidekick API (https://scholar-sidekick.com). No key is\n" +
        "required for the free rate-limited tier; pass --rapidapi-key or --api-key to\n" +
        "raise limits and unlock paid features.",
    )
    .version(VERSION, "-v, --version", "print the CLI version")
    .option("--json", "output raw API JSON instead of human-readable text")
    .option("--rapidapi-key <key>", "RapidAPI key (or set RAPIDAPI_KEY)")
    .option("--api-key <key>", "first-party API key (or set SCHOLAR_API_KEY)")
    .option("--base-url <url>", "override the API base URL (or set SCHOLAR_SIDEKICK_URL)")
    .option("--timeout <ms>", "request timeout in milliseconds (or set SCHOLAR_SIDEKICK_TIMEOUT_MS)")
    .option("--plan <tier>", "dev/self-host plan override (sent as X-Scholar-Plan)")
    .option("--quiet", "suppress the provenance footer")
    .option("--no-color", "disable coloured output");

  registerFormat(program);
  registerResolve(program);
  registerExport(program);
  registerFormatItems(program);
  registerStream(program);
  registerVerify(program);
  registerRetraction(program);
  registerOa(program);
  registerStyles(program);
  registerHealth(program);

  return program;
}
