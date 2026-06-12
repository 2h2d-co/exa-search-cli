# exa-search-cli

An unofficial, zero-runtime-dependency CLI for the [Exa Search API](https://api.exa.ai/search).

This project is not affiliated with, endorsed by, or maintained by Exa.

## Requirements

- Node.js 24 or newer
- An Exa API key

## Package

- npm package: `exa-search-cli`
- CLI command: `exa-search`
- no runtime dependencies and no install/postinstall scripts
- TypeScript source uses strippable syntax and npm distribution runs compiled JavaScript through a small bin shim

## Install

```bash
npm install -g exa-search-cli
```

With mise, use the npm backend. Because this alpha was just published, bypass the default minimum release age:

```bash
mise use --minimum-release-age 0d npm:exa-search-cli@0.0.1-alpha.2
exa-search --version
```

For a one-off run:

```bash
MISE_MINIMUM_RELEASE_AGE=0d mise x npm:exa-search-cli@0.0.1-alpha.2 -- exa-search --help
```

## Authentication

```bash
export EXA_API_KEY="your-api-key"
```

You can also pass `--api-key`, or set `EXA_BASE_URL` for testing against a compatible endpoint.

## Usage

```bash
exa-search "recent breakthroughs in quantum computing" --num-results 5
exa-search "AI regulation policy updates" --category news --include-domain reuters.com,bbc.com --start-published-date 2025-01-01
exa-search "compare frontier AI model releases" --type deep --system-prompt "Prefer official sources" --output-schema @schema.json
```

Default output is pretty JSON. Use `--format text`, `--format urls`, or `--compact`.

By default, the CLI requests `contents.highlights: true`. If you pass `--body` or explicitly choose another content mode such as `--text` or `--summary`, only those requested content options are sent.

Run `exa-search --help` for the full option list.

## Development

```bash
mise install
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run pack:dry
```

Publishing tasks dry-run by default. Pass `--execute` to publish for real:

```bash
mise run publish:alpha
mise run publish:alpha --execute
mise run publish:beta
mise run publish:prod
```

The project uses `oxfmt`, `oxlint`, TypeScript 6 with `erasableSyntaxOnly`, and publishes compiled JavaScript without install/postinstall scripts.

## License

MIT
