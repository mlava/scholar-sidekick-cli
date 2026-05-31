import { afterEach, describe, expect, it, vi } from "vitest";

import { callApi, exportCitation, health, listStyles } from "../src/client.js";
import { resolveConfig } from "../src/config.js";
import { fakeResponse, mockFetch } from "./helpers.js";

const cfg = (over = {}, env = {} as NodeJS.ProcessEnv) => resolveConfig(over, env);

afterEach(() => vi.unstubAllGlobals());

describe("callApi", () => {
  it("POSTs JSON, captures scholar headers and request id", async () => {
    const fetchMock = mockFetch(
      fakeResponse({
        json: { ok: true, text: "hi" },
        headers: { "x-request-id": "server-rid", "x-scholar-cache": "miss", "content-type": "application/json" },
      }),
    );
    const res = await callApi(cfg(), "/api/format", { body: { text: "10.1/x" } });

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ ok: true, text: "hi" });
    expect(res.requestId).toBe("server-rid");
    expect(res.headers["x-scholar-cache"]).toBe("miss");

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://scholar-sidekick.com/api/format");
    expect(opts.method).toBe("POST");
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((opts.headers as Record<string, string>)["x-request-id"]).toBeTruthy();
    expect(JSON.parse(opts.body as string)).toEqual({ text: "10.1/x" });
  });

  it("returns raw text for export (expectRawText)", async () => {
    mockFetch(fakeResponse({ text: "TY  - JOUR\nER  -", contentType: "text/plain" }));
    const res = await exportCitation(cfg(), { text: "10.1/x", format: "ris" });
    expect(res.ok).toBe(true);
    expect(res.data).toBe("TY  - JOUR\nER  -");
  });

  it("issues GET with a query string and no body", async () => {
    const fetchMock = mockFetch(fakeResponse({ json: { ok: true, styles: [] } }));
    await listStyles(cfg(), { q: "harvard", limit: 5, bundled: undefined });
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://scholar-sidekick.com/api/csl/styles?q=harvard&limit=5");
    expect(opts.method).toBe("GET");
    expect(opts.body).toBeUndefined();
  });

  it("parses error envelopes (error + code)", async () => {
    mockFetch(fakeResponse({ status: 400, json: { ok: false, error: "Unknown CSL style", code: "UNKNOWN_STYLE" } }));
    const res = await callApi(cfg(), "/api/format", { body: {} });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toBe("Unknown CSL style");
    expect(res.code).toBe("UNKNOWN_STYLE");
  });

  it("surfaces network errors as status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("boom");
    }));
    const res = await callApi(cfg(), "/api/health", { method: "GET" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(res.error).toMatch(/Network error: boom/);
  });

  it("reports timeouts on AbortError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }));
    const res = await health(cfg());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/timed out/);
  });

  it("attaches rapidapi auth headers in rapidapi mode", async () => {
    const fetchMock = mockFetch(fakeResponse({ json: { ok: true } }));
    await callApi(cfg({ rapidapiKey: "rk" }), "/api/format", { body: {} });
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const h = opts.headers as Record<string, string>;
    expect(h["X-RapidAPI-Key"]).toBe("rk");
    expect(h["X-RapidAPI-Host"]).toBe("scholar-sidekick.p.rapidapi.com");
  });

  it("warns on stderr for canonical-only paths under rapidapi mode", async () => {
    mockFetch(fakeResponse({ json: { ok: true } }));
    let stderr = "";
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => ((stderr += String(c)), true));
    await listStyles(cfg({ rapidapiKey: "rk" }), {});
    spy.mockRestore();
    expect(stderr).toMatch(/not exposed through the RapidAPI/);
  });
});
