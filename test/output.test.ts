import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CliError,
  EXIT,
  colorEnabled,
  makeStyler,
  printJson,
  printProvenance,
  printWarnings,
} from "../src/output.js";

afterEach(() => vi.restoreAllMocks());

function captureStdout(run: () => void): string {
  let s = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => ((s += String(c)), true));
  run();
  spy.mockRestore();
  return s;
}
function captureStderr(run: () => void): string {
  let s = "";
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => ((s += String(c)), true));
  run();
  spy.mockRestore();
  return s;
}

describe("makeStyler", () => {
  it("wraps with ANSI when enabled and is identity when disabled", () => {
    expect(makeStyler(true).red("x")).toBe("\x1b[31mx\x1b[0m");
    expect(makeStyler(false).red("x")).toBe("x");
    expect(makeStyler(false).bold("y")).toBe("y");
  });
});

describe("colorEnabled", () => {
  it("is false when the flag is off", () => {
    expect(colorEnabled(false, {} as NodeJS.ProcessEnv)).toBe(false);
  });
  it("is false when NO_COLOR is set", () => {
    expect(colorEnabled(true, { NO_COLOR: "1" } as NodeJS.ProcessEnv)).toBe(false);
  });
  it("tracks TTY when flag on and NO_COLOR unset", () => {
    expect(colorEnabled(true, {} as NodeJS.ProcessEnv)).toBe(Boolean(process.stdout.isTTY));
  });
});

describe("CliError", () => {
  it("carries an exit code (default API_ERROR)", () => {
    expect(new CliError("boom").code).toBe(EXIT.API_ERROR);
    expect(new CliError("boom", EXIT.NETWORK).code).toBe(EXIT.NETWORK);
  });
});

describe("writers", () => {
  it("printJson pretty-prints to stdout", () => {
    expect(captureStdout(() => printJson({ a: 1 }))).toBe('{\n  "a": 1\n}\n');
  });

  it("printWarnings writes each warning to stderr", () => {
    const out = captureStderr(() => printWarnings(["one", "two"], makeStyler(false)));
    expect(out).toBe("! one\n! two\n");
    expect(captureStderr(() => printWarnings(undefined, makeStyler(false)))).toBe("");
  });

  it("printProvenance writes a stderr footer from known headers, skipped when quiet", () => {
    const headers = { "x-request-id": "rid-1", "x-scholar-cache": "hit", "x-unknown": "z" };
    const out = captureStderr(() => printProvenance(headers, makeStyler(false), false));
    expect(out).toContain("request-id=rid-1");
    expect(out).toContain("cache=hit");
    expect(out).not.toContain("x-unknown");
    expect(captureStderr(() => printProvenance(headers, makeStyler(false), true))).toBe("");
    expect(captureStderr(() => printProvenance({}, makeStyler(false), false))).toBe("");
  });
});
