import { Readable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { EXIT } from "../../src/output.js";
import { fakeResponse, mockFetch, runCli } from "../helpers.js";

afterEach(() => vi.unstubAllGlobals());

/** Replace process.stdin with a readable yielding the given text. */
function stubStdin(text: string): () => void {
  const original = Object.getOwnPropertyDescriptor(process, "stdin");
  Object.defineProperty(process, "stdin", {
    value: Readable.from([Buffer.from(text, "utf8")]),
    configurable: true,
  });
  return () => {
    if (original) Object.defineProperty(process, "stdin", original);
  };
}

describe("format / format-items output modes", () => {
  it("format --output html prints the html body", async () => {
    mockFetch(fakeResponse({ json: { ok: true, html: "<i>cite</i>" } }));
    const { stdout } = await runCli(["format", "10.1/x", "--output", "html"]);
    expect(stdout).toContain("<i>cite</i>");
  });

  it("format-items reads stdin and honours --output html", async () => {
    const restore = stubStdin(JSON.stringify([{ title: "T" }]));
    try {
      mockFetch(fakeResponse({ json: { ok: true, html: "<b>x</b>" } }));
      const { stdout } = await runCli(["format-items", "--output", "html"]);
      expect(stdout).toContain("<b>x</b>");
    } finally {
      restore();
    }
  });

  it("format-items --output json renders metadata", async () => {
    const restore = stubStdin(JSON.stringify([{ title: "T" }]));
    try {
      mockFetch(fakeResponse({ json: { ok: true, items: [{ title: "Resolved T" }] } }));
      const { stdout } = await runCli(["format-items", "--output", "json"]);
      expect(stdout).toContain("Resolved T");
    } finally {
      restore();
    }
  });
});

describe("resolve rendering", () => {
  it("abbreviates author lists longer than three with et al.", async () => {
    const authors = ["A", "B", "C", "D"].map((f) => ({ family: f }));
    mockFetch(fakeResponse({ json: { ok: true, items: [{ title: "T", authors, warnings: [] }], warnings: ["w"] } }));
    const { stdout, stderr } = await runCli(["resolve", "10.1/x"]);
    expect(stdout).toContain("et al.");
    expect(stderr).toContain("w");
  });
});

describe("verify alternate verdicts", () => {
  it("renders an ambiguous verdict", async () => {
    mockFetch(fakeResponse({ json: { ok: true, verdict: "ambiguous", confidence: "low", matched: { title: "Real" } } }));
    const { stdout } = await runCli(["verify", "--title", "X", "--doi", "10.1/x"]);
    expect(stdout).toContain("AMBIGUOUS");
    expect(stdout).toContain("Real");
  });

  it("renders a not_found verdict (no resolved title)", async () => {
    mockFetch(fakeResponse({ json: { ok: true, verdict: "not_found", matched: null } }));
    const { stdout } = await runCli(["verify", "--title", "X", "--pmid", "123"]);
    expect(stdout).toContain("NOT FOUND");
  });
});

describe("retraction / oa branches", () => {
  it("flags an expression of concern", async () => {
    mockFetch(
      fakeResponse({
        json: { ok: true, doi: "10.1/x", result: { isRetracted: false, hasConcern: true, hasCorrections: false, notices: [], title: null } },
      }),
    );
    const { stdout } = await runCli(["retraction", "10.1/x"]);
    expect(stdout).toContain("Expression of concern");
  });

  it("flags a correction", async () => {
    mockFetch(
      fakeResponse({
        json: { ok: true, doi: "10.1/x", result: { isRetracted: false, hasConcern: false, hasCorrections: true, notices: [], title: null } },
      }),
    );
    const { stdout } = await runCli(["retraction", "10.1/x"]);
    expect(stdout).toContain("Correction issued");
  });

  it("notes when retraction has a doi but no result payload", async () => {
    mockFetch(fakeResponse({ json: { ok: true, doi: "10.1/x", result: null } }));
    const { stdout } = await runCli(["retraction", "10.1/x"]);
    expect(stdout).toContain("No retraction data");
  });

  it("oa notes when no DOI resolves and when result is missing", async () => {
    mockFetch(fakeResponse({ json: { ok: true, doi: null, reason: "no_doi", result: null } }));
    expect((await runCli(["oa", "x"])).stdout).toContain("cannot check OA");

    mockFetch(fakeResponse({ json: { ok: true, doi: "10.1/x", result: null } }));
    expect((await runCli(["oa", "10.1/x"])).stdout).toContain("No open-access data");
  });
});

describe("styles query flags", () => {
  it("threads bundled + no-remote into the query string", async () => {
    const fetchMock = mockFetch(fakeResponse({ json: { ok: true, styles: [], total: 0 } }));
    await runCli(["styles", "--bundled", "--no-remote"]);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("bundled=true");
    expect(url).toContain("remote=0");
  });

  it("reports when no styles matched", async () => {
    mockFetch(fakeResponse({ json: { ok: true, styles: [], total: 0 } }));
    const { stdout } = await runCli(["styles", "zzz"]);
    expect(stdout).toContain("No styles matched");
  });
});

describe("health down", () => {
  it("reports a down status as failure", async () => {
    mockFetch(fakeResponse({ json: { ok: false, status: "down" } }));
    const { stdout } = await runCli(["health"]);
    expect(stdout).toContain("down");
  });
});

describe("stream failure paths", () => {
  it("maps a transport failure to a network exit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("conn reset");
    }));
    try {
      await runCli(["stream", "10.1/x"]);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as { code?: number }).code).toBe(EXIT.NETWORK);
    }
  });

  it("ignores malformed NDJSON lines in human mode", async () => {
    const enc = new TextEncoder();
    async function* body(): AsyncGenerator<Uint8Array> {
      yield enc.encode("not-json\n");
      yield enc.encode(`${JSON.stringify({ type: "item", idx: 0, render: "ok line" })}\n`);
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), body: body() }) as unknown as Response),
    );
    const { stdout } = await runCli(["stream", "10.1/x"]);
    expect(stdout).toContain("ok line");
  });
});
