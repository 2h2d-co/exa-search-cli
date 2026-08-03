# exa-search-cli

An unofficial, zero-runtime-dependency CLI for the Exa [Search](https://api.exa.ai/search) and [Contents](https://api.exa.ai/contents) APIs.

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

You can also pass `--api-key`, or set `EXA_BASE_URL` for testing against a compatible endpoint.

## Usage

### Search

```bash
exa-search "recent breakthroughs in quantum computing" --num-results 5
exa-search "AI regulation policy updates" --category news --include-domain reuters.com,bbc.com --start-published-date 2025-01-01T00:00:00Z
exa-search "compare frontier AI model releases" --type deep --system-prompt "Prefer official sources" --output-schema @schema.json
```

### Extract contents

```bash
exa-search extract https://exa.ai/docs --highlights
exa-search extract https://example.com --text --text-max-characters 5000
exa-search extract --id https://arxiv.org/abs/2307.06435 --summary
```

Default output is pretty JSON. Use `--format text`, `--format urls`, or `--compact`.

Both commands request highlights by default. Search nests content options under `contents`; extract sends them at the request root as required by their respective OpenAPI schemas. If you pass `--body` or explicitly choose another content mode such as `--text` or `--summary`, only those requested content options are sent.

Extraction responses retain per-URL `statuses`. Text output renders them, and the CLI exits with status 2 when any URL fails while still printing the complete response.

Search streaming follows the [Exa OpenAPI specification](https://exa.ai/docs/exa-spec.yaml): synthesized output is streamed when both `stream: true` and `outputSchema` are present; otherwise Exa returns its normal JSON search response. The Contents API does not stream. The OpenAPI specification is the source of truth for request and response behavior.

Run `exa-search --help` for search options or `exa-search extract --help` for extraction options.

## Development

```bash
mise install
npm install
npm run check
npm test
npm run test:integration
npm run build
npm run pack:dry
```

`npm run test:integration` calls the live Exa API using `EXA_API_KEY`, incurs normal API charges, and skips when the key is unset. GitHub Actions reads the same key from the `EXA_API_KEY` repository or environment secret.

Stable and prerelease `v<version>` tags trigger the shared CI release flow. CI validates the release commit and tag, runs checks and tests, previews the package, and stages it on npm with provenance. Stable versions use `latest`; prereleases derive the npm dist-tag from their first prerelease identifier.

The project uses `oxfmt`, `oxlint`, TypeScript 7 with `erasableSyntaxOnly`, and publishes compiled JavaScript without install/postinstall scripts.

## License

MIT
