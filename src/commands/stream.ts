import type { Command } from "commander";

import { openStream } from "../client.js";
import { CliError, EXIT, err, out, printProvenance } from "../output.js";
import { SCHOLAR_HEADER_NAMES } from "../types.js";
import { buildContext, joinIds } from "./shared.js";

interface StreamEvent {
  type: "start" | "warning" | "skip-duplicate" | "item" | "error" | "done";
  idx?: number;
  render?: string;
  message?: string;
  output?: string;
  code?: string;
}

export function registerStream(program: Command): void {
  program
    .command("stream")
    .argument("<ids...>", "one or more identifiers to format as a streaming NDJSON batch")
    .description("Format a batch as it resolves, streaming results line-by-line (NDJSON)")
    .option("-s, --style <style>", "citation style id (default: vancouver)")
    .option("--lang <bcp47>", "BCP-47 locale tag")
    .option("--footnote", "render as a footnote/note-style citation")
    .action(async (ids: string[], opts, cmd: Command) => {
      const { config, styler } = buildContext(cmd);

      let res: Response;
      try {
        res = await openStream(config, {
          text: joinIds(ids),
          style: opts.style,
          lang: opts.lang,
          footnote: opts.footnote,
        });
      } catch (e: unknown) {
        throw new CliError(
          styler.red(`Error: ${e instanceof Error ? e.message : String(e)}`),
          EXIT.NETWORK,
        );
      }

      if (!res.ok || !res.body) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string; code?: string };
          msg = body.error ?? msg;
        } catch {
          /* keep status line */
        }
        throw new CliError(styler.red(`Error: ${msg}`), EXIT.API_ERROR);
      }

      const headers: Record<string, string> = {};
      for (const name of SCHOLAR_HEADER_NAMES) {
        const v = res.headers.get(name);
        if (v) headers[name] = v;
      }

      let printedLive = false;
      let buffered = "";
      const decoder = new TextDecoder();

      const handleLine = (line: string): void => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (config.json) {
          out(trimmed);
          return;
        }
        let ev: StreamEvent;
        try {
          ev = JSON.parse(trimmed) as StreamEvent;
        } catch {
          return;
        }
        switch (ev.type) {
          case "item":
            if (ev.render) {
              out(ev.render);
              printedLive = true;
            }
            break;
          case "warning":
            err(styler.yellow(`! ${ev.message ?? "warning"}`));
            break;
          case "error":
            err(styler.red(`! ${ev.message ?? "error"}${ev.code ? ` [${ev.code}]` : ""}`));
            break;
          case "done":
            if (!printedLive && ev.output) out(ev.output);
            break;
          default:
            break;
        }
      };

      for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
        buffered += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buffered.indexOf("\n")) >= 0) {
          handleLine(buffered.slice(0, nl));
          buffered = buffered.slice(nl + 1);
        }
      }
      if (buffered) handleLine(buffered);

      printProvenance(headers, styler, config.quiet);
    });
}
