import { SCHOLAR_HEADER_NAMES } from "./types.js";

/* ─── Exit codes ──────────────────────────────────────────────────────── */

export const EXIT = {
  OK: 0,
  API_ERROR: 1, // server returned an error envelope (4xx/5xx)
  NETWORK: 2, // transport failure / timeout
  USAGE: 3, // bad CLI usage / invalid input
} as const;

/** Error that carries an intended process exit code. Thrown by commands; the
 *  bin entrypoint prints the message to stderr and exits with `.code`. */
export class CliError extends Error {
  readonly code: number;
  constructor(message: string, code: number = EXIT.API_ERROR) {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}

/* ─── Colour ──────────────────────────────────────────────────────────── */

const CODES = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
} as const;

export type Styler = Record<Exclude<keyof typeof CODES, "reset">, (s: string) => string>;

/** Build a styler. Colour is applied only when `enabled`; otherwise each helper
 *  is the identity function (so call sites never branch on colour). */
export function makeStyler(enabled: boolean): Styler {
  const wrap =
    (code: string) =>
    (s: string): string =>
      enabled ? `${code}${s}${CODES.reset}` : s;
  return {
    bold: wrap(CODES.bold),
    dim: wrap(CODES.dim),
    red: wrap(CODES.red),
    green: wrap(CODES.green),
    yellow: wrap(CODES.yellow),
    cyan: wrap(CODES.cyan),
  };
}

/** Whether colour should be on, given the user flag and the environment. */
export function colorEnabled(flag: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!flag) return false;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  return Boolean(process.stdout.isTTY);
}

/* ─── Writers ─────────────────────────────────────────────────────────── */

export function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

export function err(line = ""): void {
  process.stderr.write(`${line}\n`);
}

export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

/** Print API `warnings` as yellow lines on stderr (never pollutes stdout). */
export function printWarnings(warnings: string[] | undefined, styler: Styler): void {
  for (const w of warnings ?? []) err(styler.yellow(`! ${w}`));
}

/** Dim one-line provenance footer (requestId + scholar headers), to stderr so
 *  it never pollutes piped stdout. Skipped when quiet. */
export function printProvenance(
  headers: Record<string, string>,
  styler: Styler,
  quiet: boolean,
): void {
  if (quiet) return;
  const parts: string[] = [];
  for (const name of SCHOLAR_HEADER_NAMES) {
    const v = headers[name];
    if (v) parts.push(`${name.replace(/^x-(scholar-)?/, "")}=${v}`);
  }
  if (parts.length === 0) return;
  err(styler.dim(`· ${parts.join("  ")}`));
}
