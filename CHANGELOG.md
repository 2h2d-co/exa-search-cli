# Changelog

All notable changes to this project will be documented in this file.

Current changes are tracked under `Unreleased`. The historical alpha releases predate the current tag-based release workflow and do not have repository tags.

## Unreleased

### Added

- OpenAPI-backed extraction flags for rich image links, rich links, and code blocks.
- Live Exa API integration coverage for publication summaries, JSON stream fallback, synthesized streaming, and API validation errors.

### Changed

- Treat Exa's OpenAPI specification as the request and response contract, including the `publication` category, nullable fields, structured summaries, and documented request limits.
- Read the CLI version directly from `package.json` so package and command versions cannot diverge.

### Fixed

- Parse OpenAPI `text-delta` stream events, surface stream errors, and format the documented JSON response when streaming is requested without an output schema.
- Preserve requested page text in text output when summaries or highlights are also present.
- Document all supported CLI options in `--help`.

## [0.0.1-alpha.2] - 2026-06-12

### Fixed

- Published compiled JavaScript through the npm bin shim so the globally installed CLI runs under Node.js.

## [0.0.1-alpha.1] - 2026-06-12

### Added

- Initial `exa-search` CLI for the Exa Search API.
- API key support through `EXA_API_KEY` and `--api-key`.
- Search request flags for Exa `/search` parameters, content options, raw `--body` JSON, and streaming responses.
- JSON, text, and URL output formats.
- Zero-runtime-dependency TypeScript source, npm bin shim, mise, formatting, linting, and node:test project setup.
