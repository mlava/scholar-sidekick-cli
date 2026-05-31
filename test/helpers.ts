import { vi } from "vitest";

import { buildProgram } from "../src/program.js";

export interface FakeResponseInit {
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
  contentType?: string;
}

/** Build a minimal fetch-Response stand-in. */
export function fakeResponse(init: FakeResponseInit = {}): Response {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("content-type")) {
    headers.set("content-type", init.contentType ?? (init.text !== undefined ? "text/plain" : "application/json"));
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => init.json,
    text: async () => init.text ?? JSON.stringify(init.json ?? null),
  } as unknown as Response;
}

/** Build a Response-like with an async-iterable body emitting NDJSON lines. */
export function ndjsonResponse(lines: string[], headers: Record<string, string> = {}): Response {
  const enc = new TextEncoder();
  async function* gen(): AsyncGenerator<Uint8Array> {
    for (const l of lines) yield enc.encode(`${l}\n`);
  }
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    body: gen(),
  } as unknown as Response;
}

/** A fetch mock that returns the given response and records calls. */
export function mockFetch(response: Response | (() => Response)): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => (typeof response === "function" ? response() : response));
  vi.stubGlobal("fetch", fn);
  return fn;
}

export interface Captured {
  stdout: string;
  stderr: string;
}

/** Capture everything written to stdout/stderr while `run` executes. */
export async function capture(run: () => Promise<void>): Promise<Captured> {
  let stdout = "";
  let stderr = "";
  const o = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => {
    stdout += String(c);
    return true;
  });
  const e = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => {
    stderr += String(c);
    return true;
  });
  try {
    await run();
  } finally {
    o.mockRestore();
    e.mockRestore();
  }
  return { stdout, stderr };
}

/** Run the CLI with the given argv (no node/script prefix) and capture output. */
export async function runCli(args: string[]): Promise<Captured> {
  const program = buildProgram();
  program.exitOverride(); // throw instead of process.exit on commander errors
  return capture(async () => {
    await program.parseAsync(args, { from: "user" });
  });
}
