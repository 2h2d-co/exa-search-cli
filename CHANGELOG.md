# Changelog

All notable changes to this project will be documented in this file.

Current changes are tracked under `Unreleased`. The historical alpha releases predate the current tag-based release workflow and do not have repository tags.

## Unreleased

### Added

- Dry-run request previews that validate and print the effective request without authentication or an API call.
- Machine-readable JSON Schemas for Search and Extract request bodies.
- Standard-input support for request bodies, JSON arrays, and Search queries.
- Atomic `--output` files, private generated `--temp-output` files, structured JSON errors, and stable exit codes.
- Black-box tests that compile, pack, unpack, and invoke the published CLI artifact.
- A packaged Agent Skill with bounded Search defaults, file-based result handling, citation guidance, and untrusted-content safeguards.
- OpenAPI-backed extraction flags for rich image links, rich links, and code blocks.
- `exa-search extract` command for the Exa Contents API, including URL and document-ID inputs, top-level content modes, freshness, subpages, extras, output formats, and per-URL status handling.
- Live Exa API integration coverage for Search and Contents requests, synthesized streaming, response statuses, and API validation errors.

### Changed

- Require an explicit `search` or `extract` command and reject unknown commands, help topics, missing option values, and ambiguous destinations before making requests.
- Default Search to `auto`, 5 results, and highlights; default Extract to highlights and strict per-URL failure handling.
- Cap focused `--text` output at 10,000 characters per result while keeping text and summaries opt-in.
- Treat singular values as exact and use JSON arrays for plural query, URL, ID, domain, section, and subpage-target inputs.
- Use compact JSON and structured errors outside interactive terminals while retaining human-readable interactive output.
- Treat Exa's OpenAPI specification as the request and response contract, including the `publication` category, nullable fields, structured summaries, and documented request limits.
- Read the CLI version directly from `package.json` so package and command versions cannot diverge.

### Fixed

- Preserve nested API error details and distinguish usage, authentication, API, timeout, network, partial Contents, and output failures.
- Parse both typed and OpenAI-compatible synthesized Search stream chunks.
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
