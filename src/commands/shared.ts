import type { Command } from "commander";

import { resolveConfig, type ResolvedConfig } from "../config.js";
import { CliError, EXIT, colorEnabled, makeStyler, out, type Styler } from "../output.js";
import type { ApiResult, BiblioItem } from "../types.js";

export interface Ctx {
  config: ResolvedConfig;
  styler: Styler;
}

/** Build per-invocation context: merged global+local opts → config + styler. */
export function buildContext(cmd: Command): Ctx {
  const config = resolveConfig(cmd.optsWithGlobals());
  return { config, styler: makeStyler(colorEnabled(config.color)) };
}

/** Return the data on success; throw a CliError (with the right exit code) on
 *  any error envelope or transport failure. */
export function unwrap<T>(result: ApiResult<T>, styler: Styler): T {
  if (!result.ok) {
    const code = result.status === 0 ? EXIT.NETWORK : EXIT.API_ERROR;
    const tag = result.code ? ` [${result.code}]` : "";
    throw new CliError(styler.red(`Error${tag}: ${result.error ?? "request failed"}`), code);
  }
  return result.data as T;
}

/** Join positional identifiers into the newline-separated `text` the API
 *  normalizes (comma/newline batches are both accepted server-side). */
export function joinIds(ids: string[]): string {
  return ids.join("\n");
}

/* ─── BiblioItem rendering (shared by resolve + format --output json) ───── */

function authorNames(item: BiblioItem): string {
  const authors = item.authors ?? [];
  const names = authors
    .map((a) => a.literal ?? [a.given, a.family].filter(Boolean).join(" "))
    .filter(Boolean);
  if (names.length === 0) return "";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")}, et al.`;
}

function year(item: BiblioItem): string {
  return item.issued?.year ? String(item.issued.year) : "";
}

function idLine(item: BiblioItem): string {
  return (item.identifiers ?? [])
    .map(({ type, value }) => `${type.toUpperCase()} ${value}`)
    .join("  ·  ");
}

/** Human-readable metadata block for one resolved BiblioItem. */
export function renderItem(item: BiblioItem, styler: Styler): void {
  out(styler.bold(item.title ?? "(untitled)"));
  const meta = [authorNames(item), year(item), item.container?.title]
    .filter(Boolean)
    .join("  ·  ");
  if (meta) out(styler.dim(meta));
  const ids = idLine(item);
  if (ids) out(styler.dim(ids));
}

export function renderItems(items: BiblioItem[], styler: Styler): void {
  items.forEach((item, i) => {
    if (i > 0) out("");
    renderItem(item, styler);
  });
}
