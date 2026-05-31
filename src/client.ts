import type { ResolvedConfig } from "./config.js";
import { unproxiedWarning } from "./config.js";
import { err } from "./output.js";
import type {
  ApiResult,
  FormatApiResponse,
  HealthApiResponse,
  OaApiResponse,
  RetractionApiResponse,
  StylesApiResponse,
  VerifyApiResponse,
} from "./types.js";
import { SCHOLAR_HEADER_NAMES } from "./types.js";

interface CallOpts {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | undefined>;
  expectRawText?: boolean;
}

function buildUrl(baseUrl: string, path: string, query?: CallOpts["query"]): string {
  const url = new URL(`${baseUrl}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/** Core HTTP caller. Captures scholar provenance headers, parses error
 *  envelopes, and surfaces network/timeout failures as a typed result rather
 *  than throwing. */
export async function callApi<T>(
  config: ResolvedConfig,
  path: string,
  opts: CallOpts = {},
): Promise<ApiResult<T>> {
  const warning = unproxiedWarning(path, config.mode);
  if (warning) err(`Warning: ${warning}`);

  const method = opts.method ?? "POST";
  const url = buildUrl(config.baseUrl, path, opts.query);
  const requestId = crypto.randomUUID();

  const headers: Record<string, string> = {
    ...config.headers,
    "x-request-id": requestId,
  };
  if (method === "POST") headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
      signal: controller.signal,
    });

    const scholarHeaders: Record<string, string> = {};
    for (const name of SCHOLAR_HEADER_NAMES) {
      const v = res.headers.get(name);
      if (v) scholarHeaders[name] = v;
    }
    const responseRid = res.headers.get("x-request-id") ?? requestId;

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      let code: string | undefined;
      try {
        const errBody = (await res.json()) as { error?: string; message?: string; code?: string };
        errorMsg = errBody.error ?? errBody.message ?? errorMsg;
        code = errBody.code;
      } catch {
        /* fall back to status line */
      }
      return { ok: false, status: res.status, error: errorMsg, code, requestId: responseRid, headers: scholarHeaders };
    }

    const ct = res.headers.get("content-type") ?? "";
    const data = (
      opts.expectRawText || !ct.includes("application/json") ? await res.text() : await res.json()
    ) as T;

    return { ok: true, status: res.status, data, requestId: responseRid, headers: scholarHeaders };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        error: `Request timed out after ${config.timeoutMs}ms`,
        requestId,
        headers: {},
      };
    }
    return {
      ok: false,
      status: 0,
      error: `Network error: ${e instanceof Error ? e.message : String(e)}`,
      requestId,
      headers: {},
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ─── Endpoint wrappers ───────────────────────────────────────────────── */

export function formatCitation(
  config: ResolvedConfig,
  body: { text: string; style?: string; lang?: string; footnote?: boolean; output?: string },
): Promise<ApiResult<FormatApiResponse>> {
  return callApi<FormatApiResponse>(config, "/api/format", { body });
}

export function formatItems(
  config: ResolvedConfig,
  body: { items: unknown[]; style?: string; lang?: string; footnote?: boolean; output?: string },
): Promise<ApiResult<FormatApiResponse>> {
  return callApi<FormatApiResponse>(config, "/api/format-items", { body });
}

export function exportCitation(
  config: ResolvedConfig,
  body: { text: string; format: string; style?: string; lang?: string },
): Promise<ApiResult<string>> {
  return callApi<string>(config, "/api/export", { body, expectRawText: true });
}

export function checkRetraction(
  config: ResolvedConfig,
  body: { id: string },
): Promise<ApiResult<RetractionApiResponse>> {
  return callApi<RetractionApiResponse>(config, "/api/retraction-check", { body });
}

export function checkOpenAccess(
  config: ResolvedConfig,
  body: { id: string },
): Promise<ApiResult<OaApiResponse>> {
  return callApi<OaApiResponse>(config, "/api/oa-check", { body });
}

export function verifyCitation(
  config: ResolvedConfig,
  body: { claimed: Record<string, unknown>; options?: { screen_with_llm?: boolean } },
): Promise<ApiResult<VerifyApiResponse>> {
  return callApi<VerifyApiResponse>(config, "/api/verify", { body });
}

export function listStyles(
  config: ResolvedConfig,
  query: Record<string, string | number | boolean | undefined>,
): Promise<ApiResult<StylesApiResponse>> {
  return callApi<StylesApiResponse>(config, "/api/csl/styles", { method: "GET", query });
}

export function health(config: ResolvedConfig): Promise<ApiResult<HealthApiResponse>> {
  return callApi<HealthApiResponse>(config, "/api/health", { method: "GET" });
}

/** Open the streaming format endpoint. Returns the raw Response so the caller
 *  can read NDJSON line-by-line. Throws on transport failure. */
export async function openStream(
  config: ResolvedConfig,
  body: { text: string; style?: string; lang?: string; footnote?: boolean },
): Promise<Response> {
  const warning = unproxiedWarning("/api/format/stream", config.mode);
  if (warning) err(`Warning: ${warning}`);
  return fetch(`${config.baseUrl}/api/format/stream`, {
    method: "POST",
    headers: { ...config.headers, "Content-Type": "application/json", "x-request-id": crypto.randomUUID() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
}
