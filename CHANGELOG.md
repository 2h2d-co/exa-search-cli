# Changelog

All notable changes to this project will be documented in this file.

The first release will be `0.0.1`. Current changes are tracked under `Unreleased`.

## Unreleased

### Added

- OpenAPI-backed extraction flags for rich image links, rich links, and code blocks.
- Initial `exa-search` CLI for the Exa Search API.
- API key support through `EXA_API_KEY` and `--api-key`.
- Search request flags for Exa `/search` parameters, content options, raw `--body` JSON, and streaming responses.
- JSON, text, and URL output formats.
- Node.js 22.19+ CLI distribution with compiled JavaScript, TypeScript source, a small npm bin shim, and no runtime dependencies or install scripts.
- mise, TypeScript, oxfmt, oxlint, and node:test project setup.

### Changed

- Treat Exa's OpenAPI specification as the request and response contract, including the `publication` category, nullable fields, structured summaries, and documented request limits.
- Read the CLI version directly from `package.json` so package and command versions cannot diverge.

### Fixed

- Parse OpenAPI `text-delta` stream events, surface stream errors, and format the documented JSON response when streaming is requested without an output schema.
- Preserve requested page text in text output when summaries or highlights are also present.
- Document all supported CLI options in `--help`.
