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
npm install -g exa-search-cli@alpha
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
npm run check
npm test
npm run build
npm run pack:dry
```

Release helper:

```bash
npm run release:publish
npm run release:publish -- --execute
```

`npm run release:publish` runs checks, tests, a build, and an npm pack dry-run first. It then defaults to an npm publish dry-run. Pass `--execute` to perform the real publish.

The publish helper derives the npm dist-tag from `package.json`: stable versions publish to `latest`, and prereleases publish to their first prerelease identifier, such as `alpha`, `beta`, or `rc`. It does not create commits or tags. A real publish requires a clean Git worktree, the release commit pushed to the branch upstream, and a pushed `v<version>` tag pointing at the release commit.

The project uses `oxfmt`, `oxlint`, TypeScript 6 with `erasableSyntaxOnly`, and publishes compiled JavaScript without install/postinstall scripts.

## License

MIT
