import { describe, expect, it } from "vitest";

import { CANONICAL_URL, DEFAULT_RAPIDAPI_HOST, resolveConfig, unproxiedWarning } from "../src/config.js";

const EMPTY = {} as NodeJS.ProcessEnv;

describe("resolveConfig — auth modes", () => {
  it("defaults to anonymous against the canonical URL", () => {
    const c = resolveConfig({}, EMPTY);
    expect(c.mode).toBe("anonymous");
    expect(c.baseUrl).toBe(CANONICAL_URL);
    expect(c.headers["X-RapidAPI-Key"]).toBeUndefined();
    expect(c.headers["X-Scholar-API-Key"]).toBeUndefined();
    expect(c.headers["User-Agent"]).toMatch(/^scholar-sidekick-cli\//);
  });

  it("always sends the X-Scholar-Client trusted-client handshake header", () => {
    for (const over of [{}, { rapidapiKey: "rk" }, { apiKey: "sk" }]) {
      const c = resolveConfig(over, EMPTY);
      expect(c.headers["X-Scholar-Client"]).toMatch(/^scholar-sidekick-cli\/\d/);
    }
  });

  it("uses RapidAPI mode + host when a rapidapi key is given (flag wins)", () => {
    const c = resolveConfig({ rapidapiKey: "rk" }, { RAPIDAPI_KEY: "envk" } as NodeJS.ProcessEnv);
    expect(c.mode).toBe("rapidapi");
    expect(c.headers["X-RapidAPI-Key"]).toBe("rk");
    expect(c.headers["X-RapidAPI-Host"]).toBe(DEFAULT_RAPIDAPI_HOST);
    expect(c.baseUrl).toBe(`https://${DEFAULT_RAPIDAPI_HOST}`);
  });

  it("honours a custom RAPIDAPI_HOST", () => {
    const c = resolveConfig({}, { RAPIDAPI_KEY: "k", RAPIDAPI_HOST: "x.example.com" } as NodeJS.ProcessEnv);
    expect(c.headers["X-RapidAPI-Host"]).toBe("x.example.com");
    expect(c.baseUrl).toBe("https://x.example.com");
  });

  it("uses first-party mode against canonical when only an api key is given", () => {
    const c = resolveConfig({}, { SCHOLAR_API_KEY: "sk" } as NodeJS.ProcessEnv);
    expect(c.mode).toBe("first-party");
    expect(c.headers["X-Scholar-API-Key"]).toBe("sk");
    expect(c.baseUrl).toBe(CANONICAL_URL);
  });

  it("prefers RapidAPI over first-party when both are present", () => {
    const c = resolveConfig({ rapidapiKey: "rk", apiKey: "sk" }, EMPTY);
    expect(c.mode).toBe("rapidapi");
  });
});

describe("resolveConfig — base URL + misc", () => {
  it("lets --base-url override everything (trailing slash trimmed)", () => {
    const c = resolveConfig({ baseUrl: "http://localhost:3000/", rapidapiKey: "rk" }, EMPTY);
    expect(c.baseUrl).toBe("http://localhost:3000");
  });

  it("falls back to SCHOLAR_SIDEKICK_URL", () => {
    const c = resolveConfig({}, { SCHOLAR_SIDEKICK_URL: "https://staging.example.com" } as NodeJS.ProcessEnv);
    expect(c.baseUrl).toBe("https://staging.example.com");
  });

  it("parses timeout from flag then env, else default", () => {
    expect(resolveConfig({ timeout: "5000" }, EMPTY).timeoutMs).toBe(5000);
    expect(resolveConfig({}, { SCHOLAR_SIDEKICK_TIMEOUT_MS: "9000" } as NodeJS.ProcessEnv).timeoutMs).toBe(9000);
    expect(resolveConfig({}, EMPTY).timeoutMs).toBe(30_000);
  });

  it("sends X-Scholar-Plan when --plan is given", () => {
    expect(resolveConfig({ plan: "PRO" }, EMPTY).headers["X-Scholar-Plan"]).toBe("pro");
  });

  it("threads json/quiet/color flags", () => {
    const c = resolveConfig({ json: true, quiet: true, color: false }, EMPTY);
    expect(c.json).toBe(true);
    expect(c.quiet).toBe(true);
    expect(c.color).toBe(false);
  });
});

describe("unproxiedWarning", () => {
  it("warns for canonical-only paths under rapidapi mode", () => {
    expect(unproxiedWarning("/api/csl/styles", "rapidapi")).toMatch(/not exposed through the RapidAPI/);
    expect(unproxiedWarning("/api/format/stream", "rapidapi")).toBeTruthy();
    expect(unproxiedWarning("/api/format-items", "rapidapi")).toBeTruthy();
  });

  it("does not warn for proxied paths or non-rapidapi modes", () => {
    expect(unproxiedWarning("/api/format", "rapidapi")).toBeNull();
    expect(unproxiedWarning("/api/csl/styles", "anonymous")).toBeNull();
    expect(unproxiedWarning("/api/csl/styles", "first-party")).toBeNull();
  });
});
