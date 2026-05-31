# Scholar Sidekick CLI

Command-line client for [Scholar Sidekick](https://scholar-sidekick.com) — resolve any scholarly identifier (DOI, PMID, PMCID, ISBN, arXiv, ISSN, NASA ADS bibcode, WHO IRIS URL) into 10,000+ citation styles or nine export formats, and run retraction, open-access, and citation-fabrication checks, straight from your terminal.

It is a thin wrapper over the public [Scholar Sidekick REST API](https://scholar-sidekick.com/docs). **No API key is required** for the free, rate-limited tier — install and go. Add a key to raise limits and unlock paid features.

![scholar CLI — verify, format, and open-access check against a live DOI](https://raw.githubusercontent.com/mlava/scholar-sidekick-cli/main/assets/preview.gif)

## Install

```bash
npm install -g scholar-sidekick-cli
```

Or run without installing:

```bash
npx scholar-sidekick-cli format 10.1016/S0140-6736(26)00603-3 --style apa
```

Requires Node.js >= 20.

## Quick start

```bash
# Format a citation (default style: Vancouver)
scholar format 10.1016/S0140-6736(26)00603-3 --style apa

# Resolve structured metadata
scholar resolve PMC7793608

# Export to a reference manager format (raw file content on stdout)
scholar export 10.1016/S0140-6736(26)00603-3 --format ris > refs.ris

# Verify a citation is real (catches the "real DOI + invented title" pattern)
scholar verify --title "Some cited title" --doi 10.1016/S0140-6736(26)00603-3

# Check retraction / open-access status
scholar retraction 10.1016/S0140-6736(26)00603-3
scholar oa 10.1016/S0140-6736(26)00603-3

# Browse citation styles
scholar styles harvard

# Service health
scholar health
```

Every command accepts **multiple identifiers** (space-, comma-, or newline-separated) for batch processing, except `verify`, `retraction`, and `oa`, which take a single identifier.

## Commands

| Command | What it does |
| --- | --- |
| `format <ids...>` | Format identifiers into a citation style. `--style`, `--lang`, `--footnote`, `--output text\|html\|json`. |
| `resolve <ids...>` | Resolve identifiers to bibliographic metadata (CSL/Biblio JSON). |
| `export <ids...>` | Export to a file format: `--format bib\|ris\|csv\|csl\|endnote-xml\|endnote-refer\|refworks\|medline\|zotero-rdf\|txt`. |
| `format-items` | Format pre-resolved items from `--file <json>` or stdin (a JSON array). |
| `stream <ids...>` | Format a batch, streaming each result as it resolves (NDJSON). |
| `verify` | Verify a claimed citation against the record at its identifier. `--title` (required) + an identifier flag. |
| `retraction <id>` | Check retraction / correction / expression-of-concern status (Crossref / Retraction Watch). |
| `oa <id>` | Check open-access status and best legal copy (Unpaywall). Alias: `open-access`. |
| `styles [query]` | List available CSL citation styles (searchable, paginated). |
| `health` | Service liveness and diagnostics. |

Run `scholar <command> --help` for the full option list.

## Output

Human-readable text by default. Pass `--json` to any command to get the raw API
JSON instead (ideal for scripting and `jq`):

```bash
scholar resolve 10.1016/S0140-6736(26)00603-3 --json | jq '.[0].title'
```

`export` writes the raw file content to stdout, so you can redirect it straight
to a file. A dim provenance footer (request id, cache status, style, version) is
printed to **stderr** so it never pollutes piped output; suppress it with
`--quiet`. Colour is auto-disabled when output is not a TTY, when `NO_COLOR` is
set, or with `--no-color`.

## Authentication

The CLI works anonymously against the canonical API. To raise rate limits or use
paid features, supply a key:

```bash
# RapidAPI key (also switches the base URL to the RapidAPI gateway)
scholar format 10.1016/... --rapidapi-key "$RAPIDAPI_KEY"
export RAPIDAPI_KEY=...        # or via environment

# First-party Scholar Sidekick API key
scholar format 10.1016/... --api-key "$SCHOLAR_API_KEY"
export SCHOLAR_API_KEY=...
```

A [RapidAPI key](https://rapidapi.com/scholar-sidekick-scholar-sidekick-api/api/scholar-sidekick)
(free tier available) is the supported way to authenticate today. The RapidAPI
gateway exposes `format`, `export`, `verify`, `retraction`, `oa`, and `health`;
the canonical-only commands (`format-items`, `stream`, `styles`) print a warning
and should be used anonymously or with a first-party key.

### Global options

| Flag | Env var | Default |
| --- | --- | --- |
| `--rapidapi-key <key>` | `RAPIDAPI_KEY` | — |
| `--api-key <key>` | `SCHOLAR_API_KEY` | — |
| `--base-url <url>` | `SCHOLAR_SIDEKICK_URL` | `https://scholar-sidekick.com` |
| `--timeout <ms>` | `SCHOLAR_SIDEKICK_TIMEOUT_MS` | `30000` |
| `--json` | — | off (human-readable) |
| `--quiet` | — | off |
| `--no-color` | `NO_COLOR` | colour on (TTY only) |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | API returned an error (4xx/5xx), or `verify --fail-on-mismatch` and the verdict was `mismatch`/`not_found` |
| `2` | Network failure or timeout |
| `3` | Usage error (bad flags or invalid input) |

## Related

- **REST API** — [scholar-sidekick.com/docs](https://scholar-sidekick.com/docs)
- **MCP server** — [`scholar-sidekick-mcp`](https://www.npmjs.com/package/scholar-sidekick-mcp) for AI assistants
- **Website** — [scholar-sidekick.com](https://scholar-sidekick.com)

## Development

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest
npm run test:coverage # with coverage
npm run build         # bundle to dist/cli.mjs
```

## License

MIT
