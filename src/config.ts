import { VERSION } from "./version.js";

/* ─── Constants ───────────────────────────────────────────────────────── */

export const CANONICAL_URL = "https://scholar-sidekick.com";
export const DEFAULT_RAPIDAPI_HOST = "scholar-sidekick.p.rapidapi.com";
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * API paths the RapidAPI gateway proxies. Documented endpoints NOT in this set
 * (format-items, format/stream, csl/styles) are canonical-only and 404 through
 * the RapidAPI host — callers are warned before the request goes out.
 */
export const RAPIDAPI_PROXIED = new Set<string>([
  "/api/health",
  "/api/format",
  "/api/retraction-check",
  "/api/oa-check",
  "/api/verify",
  "/api/export",
]);

export type AuthMode = "anonymous" | "rapidapi" | "first-party";

/** Flags shared by every command (registered as global options on the root). */
export interface GlobalOptions {
  json?: boolean;
  rapidapiKey?: string;
  apiKey?: string;
  baseUrl?: string;
  timeout?: string | number;
  plan?: string;
  color?: boolean; // commander sets this false for --no-color
  quiet?: boolean;
}

export interface ResolvedConfig {
  baseUrl: string;
  mode: AuthMode;
  headers: Record<string, string>;
  rapidApiHost: string;
  timeoutMs: number;
  json: boolean;
  quiet: boolean;
  color: boolean;
}

function firstString(...vals: Array<string | undefined>): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

/**
 * Resolve runtime config from CLI flags + environment. Precedence per source:
 * flag > env > default. Auth-mode precedence: RapidAPI key > first-party key >
 * anonymous. The base URL defaults to the canonical site unless RapidAPI auth is
 * in play (then the RapidAPI host) — either can be overridden with --base-url.
 */
export function resolveConfig(opts: GlobalOptions, env: NodeJS.ProcessEnv = process.env): ResolvedConfig {
  const rapidApiKey = firstString(opts.rapidapiKey, env.RAPIDAPI_KEY);
  const apiKey = firstString(opts.apiKey, env.SCHOLAR_API_KEY);
  const rapidApiHost = firstString(env.RAPIDAPI_HOST) ?? DEFAULT_RAPIDAPI_HOST;

  let mode: AuthMode;
  if (rapidApiKey) mode = "rapidapi";
  else if (apiKey) mode = "first-party";
  else mode = "anonymous";

  const defaultBase = mode === "rapidapi" ? `https://${rapidApiHost}` : CANONICAL_URL;
  const baseUrl = (firstString(opts.baseUrl, env.SCHOLAR_SIDEKICK_URL) ?? defaultBase).replace(/\/+$/, "");

  const headers: Record<string, string> = {
    "User-Agent": `scholar-sidekick-cli/${VERSION}`,
    // Trusted-client handshake: the API recognises any `scholar-sidekick-*` tag
    // and grants the anonymous tier without a key (see scholar-sidekick guard.ts).
    "X-Scholar-Client": `scholar-sidekick-cli/${VERSION}`,
  };
  if (mode === "rapidapi") {
    headers["X-RapidAPI-Key"] = rapidApiKey!;
    headers["X-RapidAPI-Host"] = rapidApiHost;
  } else if (mode === "first-party") {
    headers["X-Scholar-API-Key"] = apiKey!;
  }

  // Dev / self-host plan override (server honours it only when ALLOW_PLAN_OVERRIDE=1).
  const plan = firstString(opts.plan);
  if (plan) headers["X-Scholar-Plan"] = plan.toLowerCase();

  const timeoutRaw = opts.timeout ?? env.SCHOLAR_SIDEKICK_TIMEOUT_MS;
  const timeoutMs = Number(timeoutRaw) || DEFAULT_TIMEOUT_MS;

  return {
    baseUrl,
    mode,
    headers,
    rapidApiHost,
    timeoutMs,
    json: Boolean(opts.json),
    quiet: Boolean(opts.quiet),
    // commander negates --no-color into color:false; default true.
    color: opts.color !== false,
  };
}

/**
 * When a canonical-only endpoint is invoked under RapidAPI auth, return a
 * warning string (the request would 404 through the proxy). Otherwise null.
 */
export function unproxiedWarning(path: string, mode: AuthMode): string | null {
  if (mode !== "rapidapi") return null;
  if (RAPIDAPI_PROXIED.has(path)) return null;
  return (
    `'${path}' is not exposed through the RapidAPI gateway and will likely 404. ` +
    `Drop --rapidapi-key (or set --base-url ${CANONICAL_URL}) to reach it on the canonical API.`
  );
}
