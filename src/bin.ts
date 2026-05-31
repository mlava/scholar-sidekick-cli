import { CliError, EXIT, err } from "./output.js";
import { buildProgram } from "./program.js";

async function main(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}

main().catch((e: unknown) => {
  if (e instanceof CliError) {
    if (e.message) err(e.message);
    process.exit(e.code);
  }
  err(`Fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(EXIT.USAGE);
});
