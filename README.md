# exa-search-cli

An unofficial, zero-runtime-dependency CLI for the Exa [Search](https://exa.ai/docs/reference/search-api-guide-for-coding-agents) and [Contents](https://exa.ai/docs/reference/contents-api-guide-for-coding-agents) APIs.

This project is not affiliated with, endorsed by, or maintained by Exa.

## Requirements

- Node.js 22.19 or newer
- An Exa API key

## Package

- npm package: `exa-search-cli`
- CLI command: `exa-search`
- no runtime dependencies and no install/postinstall scripts
- TypeScript source uses strippable syntax and npm distribution runs compiled JavaScript through a small bin shim

## Install

```bash
npm install -g exa-search-cli@alpha
```

With mise, use the npm backend:

```bash
mise use npm:exa-search-cli@alpha
exa-search --version
```

For a one-off run:

```bash
mise x npm:exa-search-cli@alpha -- exa-search --help
```

## Authentication

```bash
export EXA_API_KEY="your-api-key"
```

You can also pass `--api-key`, or set `EXA_BASE_URL` for testing against a compatible endpoint. The default base URL is `https://api.exa.ai`.

## Agent-oriented defaults

The CLI requires an explicit `search` or `extract` command so mistakes fail before any request is made.

Search defaults to:

- Exa `auto` search;
- 5 results instead of the API's broader 10-result default;
- token-efficient highlights;
- Exa's recommended cache behavior, with live crawling only when cached content is unavailable.

Extract defaults to highlights and exits with code 6 if any requested URL reports a per-URL failure. Full page text, summaries, deep search, freshness controls, subpages, and extra extraction are opt-in because they add context, latency, or cost.

```bash
exa-search search \
  "current React rendering performance guidance from official documentation" \
  --temp-output

exa-search extract \
  https://react.dev/reference/react/memo \
  https://react.dev/reference/react/useMemo \
  --highlight-query "when React recommends memo and useMemo" \
  --temp-output
```

## Machine-readable requests

Singular `--url`, `--id`, `--include-domain`, `--exclude-domain`, and similar flags accept one exact value and are repeatable. Plural flags such as `--urls`, `--ids`, `--include-domains`, and `--exclude-domains` accept JSON string arrays.

Pass request JSON inline, from a file with `@path`, or from standard input with `@-`. Focused flags override matching body fields:

```bash
exa-search search --body @- --dry-run <<'JSON'
{
  "query": "latest developments in coding agents",
  "type": "auto",
  "contents": {
    "highlights": true
  }
}
JSON
```

`--dry-run` validates and prints the effective method, URL, timeout, and request without requiring an API key or making an API call. It never includes the API key. A long Search query can also be read from standard input with `--query -`.

Print the JSON Schema for either effective request body with:

```bash
exa-search schema search
exa-search schema extract
```

## Reliable output and errors

Use `--temp-output` to keep large payloads out of harness stdout without choosing a path. The CLI creates a private directory in the system temporary location, writes the response with mode `0600`, and prints only the absolute path:

```bash
exa-search search "current Exa Search API guidance" --temp-output
```

Temporary output directories use mode `0700` and persist after the command exits so the caller can read them. For a caller-selected destination, use `-o` / `--output`. Explicit output is written atomically, never replaces an existing file, and returns a compact JSON receipt containing the absolute path and byte count.

Errors default to readable text in an interactive terminal and stable JSON otherwise. Use `--error-format text`, `--error-format json`, or `--json-errors` to choose explicitly. API errors preserve the HTTP status, request/reference ID, and structured detail when available.

| Exit code | Meaning                            |
| --------- | ---------------------------------- |
| 0         | Success                            |
| 2         | Invalid command or request input   |
| 3         | Missing or invalid authentication  |
| 4         | API error                          |
| 5         | Network failure or timeout         |
| 6         | Per-URL Contents extraction errors |
| 7         | Output file error                  |

The Contents API may return HTTP 200 while individual URLs fail. The CLI preserves the complete response and exits with code 6 by default when `statuses` contains an error. Use `--allow-partial` only when those failures should still exit successfully.

## Search

Exa Search accepts a natural-language query and supports semantically rich descriptions. Start with the defaults:

```bash
exa-search search \
  "latest official announcements about frontier AI model releases" \
  --temp-output
```

Choose another search type only when the workload requires it:

- `auto`: recommended starting point and default balance of quality and latency;
- `fast`: lower latency for interactive agent loops;
- `instant`: minimum latency for real-time paths;
- `deep-lite`: lightweight multi-step research and synthesis;
- `deep`: comprehensive multi-step research;
- `deep-reasoning`: strongest reasoning for difficult analysis.

```bash
exa-search search \
  "compare the latest frontier AI model releases" \
  --type deep \
  --system-prompt "Prefer official sources and avoid duplicate findings." \
  --output-schema @schema.json \
  --temp-output
```

Highlights are enabled by default because they are extractive and substantially more token-efficient than full text. `--text` replaces that default with page text capped at 10,000 characters per result. Combine `--highlights` and `--text` only when both views are required.

```bash
exa-search search \
  "detailed analysis of transformer architecture innovations" \
  --num-results 5 \
  --text \
  --temp-output
```

Filters and crawling settings are intentionally unset by default. Add them only for hard requirements:

```bash
exa-search search \
  "AI regulation policy updates" \
  --category news \
  --include-domain reuters.com \
  --start-published-date 2026-01-01T00:00:00Z \
  --num-results 10 \
  --temp-output
```

Plural filter flags accept JSON arrays:

```bash
exa-search search \
  "official React performance guidance" \
  --include-domains '["react.dev","github.com/facebook/react"]' \
  --temp-output
```

`--additional-query` and `--additional-queries` are available only with `deep-lite`, `deep`, or `deep-reasoning`.

## Extract

Use `extract` when URLs are already known or after Search identifies the best sources. Batch related URLs in one request and focus highlights with `--highlight-query`:

```bash
exa-search extract \
  https://react.dev/reference/react/memo \
  https://react.dev/reference/react/useMemo \
  --highlight-query "rendering performance recommendations and caveats" \
  --temp-output
```

Highlights are the default. Request text only when broader context is necessary:

```bash
exa-search extract \
  https://example.com/report.pdf \
  --text \
  --temp-output
```

The focused `--text` flag caps output at 10,000 characters per URL. Use `--text-max-characters` for a smaller limit. Per-page summaries and structured extraction are available with `--summary`, `--summary-query`, and `--summary-schema`.

Leave `--max-age-hours` unset for Exa's recommended cache-with-crawl-fallback behavior:

- `-1`: cache only;
- `0`: always live crawl;
- positive value: use cache only while it is younger than that many hours.

When freshness is required, pair it with an explicit live-crawl timeout:

```bash
exa-search extract \
  https://example.com/current-pricing \
  --highlight-query "current pricing and limits" \
  --max-age-hours 0 \
  --livecrawl-timeout 15000 \
  --temp-output
```

Subpages and extras are advanced opt-ins:

```bash
exa-search extract \
  https://docs.example.com \
  --text-max-characters 5000 \
  --subpages 10 \
  --subpage-target api \
  --subpage-target reference \
  --links 10 \
  --temp-output
```

## Streaming

Search streaming is intended for interactive synthesized output. Use `--stream` with `--output-schema`; streamed text is written directly to stdout. File output is deliberately unavailable in streaming mode because the stream does not provide the same single authoritative JSON payload as a normal response.

If `stream: true` is sent without `outputSchema`, Exa returns its normal JSON Search response and the CLI formats it normally.

## Shared options

```text
--body <json|@file|@->           Base request JSON. Use @- for stdin; flags override matching fields.
--format <json|text|urls>        Output format. Default: json.
--compact                        Minify JSON; automatic for files and non-interactive stdout.
--pretty                         Pretty-print JSON; automatic in an interactive terminal.
-o, --output <path>              Atomically write output without replacing an existing file.
--temp-output                    Write to a private temporary file and print its absolute path.
--error-format <text|json>       Default: text interactively, json otherwise.
--json-errors                    Alias for --error-format json.
--allow-partial                  Exit 0 when Extract reports per-URL errors.
--dry-run                        Print the effective request without authentication or an API call.
--timeout <ms>                   Request timeout. Default: 60000.
```

Default output is JSON: pretty in an interactive terminal and compact in files or non-interactive output. Use `--format text`, `--format urls`, `--pretty`, or `--compact` to override presentation.

Run `exa-search --help`, `exa-search help search`, or `exa-search help extract` for the complete option list.

## API contract

The deployed Exa OpenAPI specification at `https://api.exa.ai/openapi.json` is the request and response contract. Exa's coding-agent guides and best-practice documentation inform the CLI defaults.

The CLI excludes deprecated request fields such as `context`, `livecrawl`, `startCrawlDate`, `endCrawlDate`, `numSentences`, and `highlightsPerUrl`, and returns actionable validation errors if they appear in `--body`.

## Development

```bash
mise install
npm install
npm run check
npm test
npm run pack:dry
```

`npm test` combines fast source-level tests with black-box package tests. The package tests copy the publishable sources into a temporary directory, compile them, create an npm tarball, unpack it, and invoke its declared `exa-search` binary directly. This catches packaging and compiled-runtime failures that source-only tests cannot detect without making API requests.

Run the separate live integration suite with a real Exa API key:

```bash
EXA_API_KEY="..." npm run test:integration
```

The integration suite calls the live Exa API and incurs normal API charges. GitHub Actions reads the same key from the `EXA_API_KEY` repository secret.

Stable and prerelease `v<version>` tags trigger the shared CI release flow. CI validates the release commit and tag, runs checks and tests, previews the package, and stages it on npm with provenance. Stable versions use `latest`; prereleases derive the npm dist-tag from their first prerelease identifier.

The project uses `oxfmt`, `oxlint`, TypeScript 7 with `erasableSyntaxOnly`, and publishes compiled JavaScript without install/postinstall scripts.

## License

MIT
