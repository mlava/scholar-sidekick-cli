/* ─── API response types (subset ported from scholar-sidekick-mcp) ─────── */

export interface FormatApiResponse {
  ok: boolean;
  formatter?: string;
  styleUsed?: string;
  lang?: string;
  text?: string;
  html?: string;
  items?: BiblioItem[];
  warnings?: string[];
  error?: string;
  code?: string;
}

/** Loose shape of the internal BiblioItem the API returns for output=json —
 *  only the fields the CLI renders are typed. (Mirrors scholar-sidekick's
 *  src/types/biblio.ts; intentionally not CSL-JSON.) */
export interface BiblioItem {
  title?: string;
  subtitle?: string;
  authors?: Array<{ family?: string; given?: string; literal?: string }>;
  container?: { title?: string; abbreviation?: string; volume?: string; issue?: string };
  issued?: { year?: number; month?: number; day?: number };
  identifiers?: Array<{ type: string; value: string }>;
  url?: string;
  type?: string;
  [key: string]: unknown;
}

export interface ResolvedFrom {
  type: string;
  value: string;
}

export interface RetractionNotice {
  type: string;
  label?: string;
  doi?: string;
  date?: string;
  source?: string;
}

export interface RetractionResult {
  isRetracted: boolean;
  hasCorrections: boolean;
  hasConcern: boolean;
  notices: RetractionNotice[];
  title: string | null;
}

export interface RetractionApiResponse {
  ok: boolean;
  doi: string | null;
  resolvedFrom?: ResolvedFrom;
  reason?: string;
  result: RetractionResult | null;
  error?: string;
}

export interface OaLocation {
  url: string;
  hostType?: string;
  license?: string;
  version?: string;
}

export interface OaResult {
  isOa: boolean;
  oaStatus: "gold" | "green" | "hybrid" | "bronze" | "closed";
  title: string | null;
  bestLocation: OaLocation | null;
  locations: OaLocation[];
}

export interface OaApiResponse {
  ok: boolean;
  doi: string | null;
  resolvedFrom?: ResolvedFrom;
  reason?: string;
  result: OaResult | null;
  error?: string;
}

export interface VerifyMismatch {
  field: "title" | "first_author" | "year" | "container";
  claimed: string | number | null;
  resolved: string | number | null;
  similarity: number;
}

export interface VerifyApiResponse {
  ok: boolean;
  verdict?: "matched" | "mismatch" | "not_found" | "ambiguous";
  confidence?: "high" | "medium" | "low";
  matched?: BiblioItem | null;
  mismatches?: VerifyMismatch[];
  candidates?: Array<{ item: BiblioItem; registries: string[]; score: number }>;
  _provenance?: Record<string, unknown>;
  error?: string;
  code?: string;
  requestId?: string;
}

export interface StyleSummary {
  id: string;
  title?: string;
  titleShort?: string;
  categories?: string[];
  bundled?: boolean;
}

export interface StylesApiResponse {
  ok?: boolean;
  styles?: StyleSummary[];
  total?: number;
  limit?: number;
  offset?: number;
  categories?: string[];
  error?: string;
}

export interface HealthApiResponse {
  ok?: boolean;
  status?: string;
  [key: string]: unknown;
}

/** Result of a single HTTP call through the client. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  code?: string;
  requestId?: string;
  headers: Record<string, string>;
}

/* ─── Scholar provenance headers worth surfacing ──────────────────────── */

export const SCHOLAR_HEADER_NAMES = [
  "x-request-id",
  "x-scholar-cache",
  "x-scholar-formatter",
  "x-scholar-style-used",
  "x-scholar-style",
  "x-csl-warning",
  "x-scholar-warnings",
  "x-scholar-verify-verdict",
  "x-scholar-verify-confidence",
  "x-scholar-verify-version",
  "x-scholar-transform-version",
] as const;
