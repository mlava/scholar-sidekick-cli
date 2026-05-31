import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CliError, EXIT } from "../../src/output.js";
import { fakeResponse, mockFetch, ndjsonResponse, runCli } from "../helpers.js";

afterEach(() => vi.unstubAllGlobals());

const ITEM = {
  title: "Fabricated citations",
  authors: [{ family: "Topaz", given: "Maxim" }],
  container: { title: "The Lancet" },
  issued: { year: 2026 },
  identifiers: [{ type: "doi", value: "10.1/x" }],
};

/** Run the CLI expecting the action to throw a CliError with the given code. */
async function expectExit(args: string[], code: number): Promise<CliError> {
  try {
    await runCli(args);
  } catch (e) {
    expect(e).toBeInstanceOf(CliError);
    expect((e as CliError).code).toBe(code);
    return e as CliError;
  }
  throw new Error(`expected CliError(${code}) but none thrown`);
}

describe("format", () => {
  it("prints formatted text and sends the right body", async () => {
    const fetchMock = mockFetch(fakeResponse({ json: { ok: true, text: "Topaz M. ...", warnings: [] } }));
    const { stdout } = await runCli(["format", "10.1/x", "--style", "apa"]);
    expect(stdout).toContain("Topaz M. ...");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ text: "10.1/x", style: "apa", output: "text" });
  });

  it("emits raw JSON with --json", async () => {
    mockFetch(fakeResponse({ json: { ok: true, text: "X" } }));
    const { stdout } = await runCli(["format", "10.1/x", "--json"]);
    expect(JSON.parse(stdout)).toEqual({ ok: true, text: "X" });
  });

  it("renders metadata for --output json", async () => {
    mockFetch(fakeResponse({ json: { ok: true, items: [ITEM] } }));
    const { stdout } = await runCli(["format", "10.1/x", "--output", "json"]);
    expect(stdout).toContain("Fabricated citations");
    expect(stdout).toContain("The Lancet");
    expect(stdout).toContain("DOI 10.1/x");
  });

  it("prints warnings to stderr", async () => {
    mockFetch(fakeResponse({ json: { ok: true, text: "X", warnings: ["fallback-to-default"] } }));
    const { stderr } = await runCli(["format", "10.1/x"]);
    expect(stderr).toContain("fallback-to-default");
  });

  it("exits 1 on an API error envelope", async () => {
    mockFetch(fakeResponse({ status: 400, json: { ok: false, error: "bad", code: "VALIDATION_ERROR" } }));
    const e = await expectExit(["format", "10.1/x"], EXIT.API_ERROR);
    expect(e.message).toContain("VALIDATION_ERROR");
  });
});

describe("resolve", () => {
  it("renders item metadata and requests output=json", async () => {
    const fetchMock = mockFetch(fakeResponse({ json: { ok: true, items: [ITEM] } }));
    const { stdout } = await runCli(["resolve", "10.1/x"]);
    expect(stdout).toContain("Fabricated citations");
    expect(stdout).toContain("Maxim Topaz");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.output).toBe("json");
  });

  it("prints just the items array with --json", async () => {
    mockFetch(fakeResponse({ json: { ok: true, items: [ITEM] } }));
    const { stdout } = await runCli(["resolve", "10.1/x", "--json"]);
    expect(Array.isArray(JSON.parse(stdout))).toBe(true);
  });
});

describe("export", () => {
  it("writes raw content to stdout", async () => {
    mockFetch(fakeResponse({ text: "TY  - JOUR\nER  -", contentType: "text/plain" }));
    const { stdout } = await runCli(["export", "10.1/x", "--format", "ris"]);
    expect(stdout).toBe("TY  - JOUR\nER  -\n");
  });

  it("wraps content with --json", async () => {
    mockFetch(fakeResponse({ text: "BIB", contentType: "text/plain" }));
    const { stdout } = await runCli(["export", "10.1/x", "--format", "bib", "--json"]);
    expect(JSON.parse(stdout)).toEqual({ format: "bib", content: "BIB" });
  });
});

describe("format-items", () => {
  const fixture = join(tmpdir(), `ss-cli-items-${process.pid}.json`);
  afterEach(() => rm(fixture, { force: true }));

  it("reads a JSON file and formats it", async () => {
    await writeFile(fixture, JSON.stringify([ITEM]));
    const fetchMock = mockFetch(fakeResponse({ json: { ok: true, text: "rendered" } }));
    const { stdout } = await runCli(["format-items", "--file", fixture]);
    expect(stdout).toContain("rendered");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("rejects non-array JSON with a usage error", async () => {
    await writeFile(fixture, JSON.stringify({ not: "an array" }));
    await expectExit(["format-items", "--file", fixture], EXIT.USAGE);
  });

  it("rejects invalid JSON with a usage error", async () => {
    await writeFile(fixture, "not json");
    await expectExit(["format-items", "--file", fixture], EXIT.USAGE);
  });
});

describe("stream", () => {
  it("prints item renders as they arrive", async () => {
    mockFetch(
      ndjsonResponse([
        JSON.stringify({ type: "start", idx: -1 }),
        JSON.stringify({ type: "item", idx: 0, render: "Citation one." }),
        JSON.stringify({ type: "item", idx: 1, render: "Citation two." }),
        JSON.stringify({ type: "done", idx: -1, output: "ignored-because-live" }),
      ]),
    );
    const { stdout } = await runCli(["stream", "10.1/x"]);
    expect(stdout).toContain("Citation one.");
    expect(stdout).toContain("Citation two.");
    expect(stdout).not.toContain("ignored-because-live");
  });

  it("falls back to the done.output when no live renders (CSL path)", async () => {
    mockFetch(
      ndjsonResponse([
        JSON.stringify({ type: "item", idx: 0 }),
        JSON.stringify({ type: "done", idx: -1, output: "Full CSL output." }),
      ]),
    );
    const { stdout } = await runCli(["stream", "10.1/x"]);
    expect(stdout).toContain("Full CSL output.");
  });

  it("re-emits raw NDJSON lines with --json", async () => {
    mockFetch(ndjsonResponse([JSON.stringify({ type: "item", idx: 0, render: "x" })]));
    const { stdout } = await runCli(["stream", "10.1/x", "--json"]);
    expect(stdout.trim()).toBe(JSON.stringify({ type: "item", idx: 0, render: "x" }));
  });

  it("surfaces per-line errors and warnings on stderr", async () => {
    mockFetch(
      ndjsonResponse([
        JSON.stringify({ type: "warning", idx: -1, message: "style fallback" }),
        JSON.stringify({ type: "error", idx: 0, message: "unresolvable", code: "UPSTREAM_TIMEOUT" }),
        JSON.stringify({ type: "done", idx: -1, output: "" }),
      ]),
    );
    const { stderr } = await runCli(["stream", "10.1/x"]);
    expect(stderr).toContain("style fallback");
    expect(stderr).toContain("UPSTREAM_TIMEOUT");
  });

  it("exits 1 when the stream endpoint returns an HTTP error", async () => {
    mockFetch(fakeResponse({ status: 503, json: { ok: false, error: "Streaming disabled" } }));
    await expectExit(["stream", "10.1/x"], EXIT.API_ERROR);
  });
});

describe("verify", () => {
  it("requires at least one identifier", async () => {
    await expectExit(["verify", "--title", "X"], EXIT.USAGE);
  });

  it("renders a matched verdict and bundles claimed fields", async () => {
    const fetchMock = mockFetch(
      fakeResponse({ json: { ok: true, verdict: "matched", confidence: "high", matched: ITEM } }),
    );
    const { stdout } = await runCli([
      "verify",
      "--title",
      "Fabricated citations",
      "--doi",
      "10.1/x",
      "--author",
      "Topaz",
      "--year",
      "2026",
    ]);
    expect(stdout).toContain("MATCHED");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.claimed).toMatchObject({ title: "Fabricated citations", doi: "10.1/x", year: 2026 });
    expect(body.claimed.authors).toEqual([{ family: "Topaz" }]);
  });

  it("sends the LLM-screen option when requested", async () => {
    const fetchMock = mockFetch(fakeResponse({ json: { ok: true, verdict: "matched" } }));
    await runCli(["verify", "--title", "X", "--doi", "10.1/x", "--screen-with-llm"]);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.options).toEqual({ screen_with_llm: true });
  });

  it("renders mismatches and exits 1 with --fail-on-mismatch", async () => {
    mockFetch(
      fakeResponse({
        json: {
          ok: true,
          verdict: "mismatch",
          confidence: "high",
          matched: ITEM,
          mismatches: [{ field: "title", claimed: "Wrong", resolved: "Fabricated citations", similarity: 0.4 }],
        },
      }),
    );
    await expectExit(["verify", "--title", "Wrong", "--doi", "10.1/x", "--fail-on-mismatch"], EXIT.API_ERROR);
  });
});

describe("retraction", () => {
  it("reports a clean record", async () => {
    mockFetch(
      fakeResponse({
        json: { ok: true, doi: "10.1/x", result: { isRetracted: false, hasConcern: false, hasCorrections: false, notices: [], title: "T" } },
      }),
    );
    const { stdout } = await runCli(["retraction", "10.1/x"]);
    expect(stdout).toContain("No retraction");
  });

  it("flags a retraction with notices", async () => {
    mockFetch(
      fakeResponse({
        json: {
          ok: true,
          doi: "10.1/x",
          result: {
            isRetracted: true,
            hasConcern: false,
            hasCorrections: false,
            title: "Bad paper",
            notices: [{ type: "retraction", label: "Retraction", date: "2024-01-01", source: "RW" }],
          },
        },
      }),
    );
    const { stdout } = await runCli(["retraction", "10.1/x"]);
    expect(stdout).toContain("RETRACTED");
    expect(stdout).toContain("Retraction");
  });

  it("notes when no DOI resolves", async () => {
    mockFetch(fakeResponse({ json: { ok: true, doi: null, reason: "no_doi", result: null } }));
    const { stdout } = await runCli(["retraction", "9780000000000"]);
    expect(stdout).toContain("no_doi");
  });
});

describe("oa", () => {
  it("reports an open-access copy", async () => {
    mockFetch(
      fakeResponse({
        json: {
          ok: true,
          doi: "10.1/x",
          result: {
            isOa: true,
            oaStatus: "gold",
            title: "Open paper",
            bestLocation: { url: "https://example.com/pdf", version: "publishedVersion", license: "cc-by" },
            locations: [],
          },
        },
      }),
    );
    const { stdout } = await runCli(["oa", "10.1/x"]);
    expect(stdout).toContain("Open access (gold)");
    expect(stdout).toContain("https://example.com/pdf");
  });

  it("is reachable via the open-access alias", async () => {
    mockFetch(fakeResponse({ json: { ok: true, doi: "10.1/x", result: { isOa: false, oaStatus: "closed", title: null, bestLocation: null, locations: [] } } }));
    const { stdout } = await runCli(["open-access", "10.1/x"]);
    expect(stdout).toContain("Closed");
  });
});

describe("styles", () => {
  it("lists styles with a paging footer", async () => {
    mockFetch(
      fakeResponse({
        json: {
          ok: true,
          total: 2,
          offset: 0,
          styles: [
            { id: "apa", title: "American Psychological Association", bundled: true },
            { id: "harvard-x", title: "Harvard", bundled: false },
          ],
        },
      }),
    );
    const { stdout } = await runCli(["styles", "--limit", "2"]);
    expect(stdout).toContain("apa");
    expect(stdout).toContain("Showing 2 of 2");
  });

  it("lists categories with --categories", async () => {
    mockFetch(fakeResponse({ json: { ok: true, categories: ["medicine", "science"] } }));
    const { stdout } = await runCli(["styles", "--categories"]);
    expect(stdout).toContain("medicine");
  });
});

describe("health", () => {
  it("reports an ok status", async () => {
    mockFetch(fakeResponse({ json: { ok: true, status: "ok" } }));
    const { stdout } = await runCli(["health"]);
    expect(stdout).toContain("ok");
    expect(stdout).toContain("scholar-sidekick.com");
  });
});
