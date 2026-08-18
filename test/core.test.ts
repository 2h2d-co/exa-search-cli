import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CliError,
  contentResponseErrors,
  formatResponse,
  hasContentErrors,
  helpText,
  isJsonObject,
  isString,
  type JsonObject,
  parseCli,
  requestPreview,
  VERSION,
} from "../src/core.ts";
import { requestSchema } from "../src/schema.ts";

const env = { EXA_API_KEY: "test-key" };

test("requires explicit commands and applies bounded Search defaults", () => {
  assert.throws(
    () => parseCli(["recent", "LLM", "news"], env),
    (error: unknown) => error instanceof CliError && error.message.includes("Unknown command"),
  );

  const command = parseCli(["search", "recent", "LLM", "news"], env);
  assert.equal(command.kind, "run");
  if (command.kind !== "run") {
    return;
  }

  assert.equal(command.endpoint, "search");
  assert.equal(command.options.endpoint, "search");
  assert.deepEqual(command.options.request, {
    contents: { highlights: true },
    numResults: 5,
    query: "recent LLM news",
    type: "auto",
  });
  assert.equal(command.options.apiKey, "test-key");
  assert.equal(command.options.baseUrl, "https://api.exa.ai");
  assert.equal(command.options.compact, undefined);
  assert.equal(command.options.failOnErrors, false);
});

test("supports help, version, schemas, and rejects unknown topics", () => {
  assert.deepEqual(parseCli(["-h"], {}), { kind: "help" });
  assert.deepEqual(parseCli(["search", "--help"], {}), {
    endpoint: "search",
    kind: "help",
  });
  assert.deepEqual(parseCli(["help", "extract"], {}), {
    endpoint: "extract",
    kind: "help",
  });
  assert.deepEqual(parseCli(["-V"], {}), { kind: "version" });
  assert.deepEqual(parseCli(["schema", "search"], {}), {
    endpoint: "search",
    kind: "schema",
  });
  assert.throws(
    () => parseCli(["help", "unknown"], {}),
    (error: unknown) => error instanceof CliError && error.message.includes("Unknown help topic"),
  );
});

test("uses explicit content modes instead of default highlights", () => {
  const text = parseCli(
    ["search", "--query", "architecture", "--text", "--text-max-characters", "5000"],
    env,
  );
  assert.equal(text.kind, "run");
  if (text.kind === "run") {
    assert.deepEqual(text.options.request, {
      contents: { text: { maxCharacters: 5000 } },
      numResults: 5,
      query: "architecture",
      type: "auto",
    });
  }

  const summary = parseCli(["search", "architecture", "--summary"], env);
  assert.equal(summary.kind, "run");
  if (summary.kind === "run") {
    assert.deepEqual(summary.options.request["contents"], { summary: {} });
  }

  const combined = parseCli(["search", "architecture", "--text", "--highlights"], env);
  assert.equal(combined.kind, "run");
  if (combined.kind === "run") {
    assert.deepEqual(combined.options.request["contents"], {
      highlights: true,
      text: { maxCharacters: 10_000 },
    });
  }
});

test("adds highlights to body requests without a content mode and preserves explicit modes", () => {
  const defaulted = parseCli(
    [
      "search",
      "--body",
      '{"query":"from body","contents":{"maxAgeHours":24}}',
      "--num-results",
      "3",
    ],
    env,
  );
  assert.equal(defaulted.kind, "run");
  if (defaulted.kind === "run") {
    assert.deepEqual(defaulted.options.request, {
      contents: {
        highlights: true,
        maxAgeHours: 24,
      },
      numResults: 3,
      query: "from body",
      type: "auto",
    });
  }

  const explicit = parseCli(
    [
      "search",
      "--body",
      '{"query":"from body","numResults":9,"type":"fast","contents":{"summary":{}}}',
    ],
    env,
  );
  assert.equal(explicit.kind, "run");
  if (explicit.kind === "run") {
    assert.deepEqual(explicit.options.request, {
      contents: { summary: {} },
      numResults: 9,
      query: "from body",
      type: "fast",
    });
  }

  const disabled = parseCli(["search", "--body", '{"query":"metadata only","contents":null}'], env);
  assert.equal(disabled.kind, "run");
  if (disabled.kind === "run") {
    assert.equal(disabled.options.request["contents"], null);
  }
});

test("preserves exact singular values and accepts plural JSON arrays", () => {
  const search = parseCli(
    [
      "search",
      "Federal Reserve, SEC guidance",
      "--include-domain",
      "exa.ai/docs,reference",
      "--include-domains",
      '["example.com/docs","*.substack.com"]',
      "--additional-queries",
      '["Fed policy","SEC guidance"]',
      "--type",
      "deep",
    ],
    env,
  );
  assert.equal(search.kind, "run");
  if (search.kind === "run") {
    assert.equal(search.options.request["query"], "Federal Reserve, SEC guidance");
    assert.deepEqual(search.options.request["includeDomains"], [
      "exa.ai/docs,reference",
      "example.com/docs",
      "*.substack.com",
    ]);
    assert.deepEqual(search.options.request["additionalQueries"], ["Fed policy", "SEC guidance"]);
  }

  const extract = parseCli(
    [
      "extract",
      "--url",
      "https://example.com/reports/a,b",
      "--urls",
      '["https://example.com/a","https://example.com/b"]',
    ],
    env,
  );
  assert.equal(extract.kind, "run");
  if (extract.kind === "run") {
    assert.deepEqual(extract.options.request["urls"], [
      "https://example.com/reports/a,b",
      "https://example.com/a",
      "https://example.com/b",
    ]);
  }
});

test("accepts request bodies and Search queries from standard input once", () => {
  const search = parseCli(
    ["search", "--query", "-", "--dry-run"],
    {},
    { readStdin: () => "current Exa Search API guidance\n" },
  );
  assert.equal(search.kind, "run");
  if (search.kind === "run") {
    assert.equal(search.options.apiKey, undefined);
    assert.equal(search.options.request["query"], "current Exa Search API guidance");
  }

  const body = parseCli(
    ["search", "--body", "@-", "--dry-run"],
    {},
    { readStdin: () => '{"query":"from stdin"}' },
  );
  assert.equal(body.kind, "run");
  if (body.kind === "run") {
    assert.equal(body.options.request["query"], "from stdin");
  }

  assert.throws(
    () =>
      parseCli(
        ["search", "--body", "@-", "--include-domains", "@-", "--dry-run"],
        {},
        { readStdin: () => '{"query":"from stdin"}' },
      ),
    (error: unknown) => error instanceof CliError && error.message.includes("only be read once"),
  );
});

test("builds redacted dry-run previews without authentication", () => {
  const command = parseCli(["search", "Exa Search API", "--api-key", "secret", "--dry-run"], {});
  assert.equal(command.kind, "run");
  if (command.kind !== "run") {
    return;
  }

  const preview = requestPreview(command.options);
  assert.deepEqual(preview, {
    endpoint: "search",
    method: "POST",
    request: {
      contents: { highlights: true },
      numResults: 5,
      query: "Exa Search API",
      type: "auto",
    },
    timeout_ms: 60_000,
    url: "https://api.exa.ai/search",
  });
  assert.doesNotMatch(JSON.stringify(preview), /secret/);
});

test("builds current Search filters, synthesis, and advanced content options", () => {
  const command = parseCli(
    [
      "search",
      "compare frontier model releases",
      "--type",
      "deep-reasoning",
      "--num-results",
      "10",
      "--category",
      "news",
      "--user-location",
      "gb",
      "--include-domain",
      "openai.com",
      "--start-published-date",
      "2026-01-01T00:00:00Z",
      "--end-published-date",
      "2026-08-03T00:00:00Z",
      "--moderation",
      "--additional-query",
      "frontier model launches",
      "--system-prompt",
      "Prefer official sources.",
      "--output-schema",
      '{"type":"text","description":"One paragraph."}',
      "--highlights",
      "--highlight-query",
      "release claims and dates",
      "--highlight-max-characters",
      "5000",
      "--text-max-characters",
      "10000",
      "--include-html-tags",
      "--text-verbosity",
      "full",
      "--include-section",
      "body",
      "--include-sections",
      '["metadata"]',
      "--exclude-section",
      "navigation",
      "--exclude-sections",
      '["footer"]',
      "--summary-query",
      "Summarize the release.",
      "--summary-schema",
      '{"type":"object"}',
      "--max-age-hours",
      "24",
      "--livecrawl-timeout",
      "12000",
      "--subpages",
      "5",
      "--subpage-target",
      "api",
      "--subpage-targets",
      '["models","pricing"]',
      "--links",
      "3",
      "--image-links",
      "2",
      "--rich-image-links",
      "1",
      "--rich-links",
      "1",
      "--code-blocks",
      "4",
      "--compliance",
      "hipaa",
      "--no-stream",
    ],
    env,
  );
  assert.equal(command.kind, "run");
  if (command.kind !== "run") {
    return;
  }

  assert.deepEqual(command.options.request, {
    additionalQueries: ["frontier model launches"],
    category: "news",
    compliance: "hipaa",
    contents: {
      extras: {
        codeBlocks: 4,
        imageLinks: 2,
        links: 3,
        richImageLinks: 1,
        richLinks: 1,
      },
      highlights: {
        maxCharacters: 5000,
        query: "release claims and dates",
      },
      livecrawlTimeout: 12_000,
      maxAgeHours: 24,
      subpageTarget: ["api", "models", "pricing"],
      subpages: 5,
      summary: {
        query: "Summarize the release.",
        schema: { type: "object" },
      },
      text: {
        excludeSections: ["navigation", "footer"],
        includeHtmlTags: true,
        includeSections: ["body", "metadata"],
        maxCharacters: 10_000,
        verbosity: "full",
      },
    },
    endPublishedDate: "2026-08-03T00:00:00Z",
    includeDomains: ["openai.com"],
    moderation: true,
    numResults: 10,
    outputSchema: { description: "One paragraph.", type: "text" },
    query: "compare frontier model releases",
    startPublishedDate: "2026-01-01T00:00:00Z",
    stream: false,
    systemPrompt: "Prefer official sources.",
    type: "deep-reasoning",
    userLocation: "GB",
  });
});

test("builds bounded Extract requests and defaults to strict partial failures", () => {
  const command = parseCli(
    [
      "extract",
      "https://example.com/a",
      "--url",
      "https://example.com/b",
      "--highlight-query",
      "pricing changes",
      "--max-age-hours",
      "0",
      "--livecrawl-timeout",
      "15000",
      "--temp-output",
      "--allow-partial",
    ],
    env,
  );
  assert.equal(command.kind, "run");
  if (command.kind !== "run") {
    return;
  }

  assert.equal(command.endpoint, "extract");
  assert.equal(command.options.endpoint, "contents");
  assert.equal(command.options.failOnErrors, false);
  assert.equal(command.options.temporaryOutput, true);
  assert.deepEqual(command.options.request, {
    highlights: { query: "pricing changes" },
    livecrawlTimeout: 15_000,
    maxAgeHours: 0,
    urls: ["https://example.com/a", "https://example.com/b"],
  });

  const strict = parseCli(["extract", "https://example.com"], env);
  assert.equal(strict.kind, "run");
  if (strict.kind === "run") {
    assert.equal(strict.options.failOnErrors, true);
    assert.deepEqual(strict.options.request, {
      highlights: true,
      urls: ["https://example.com"],
    });
  }
});

test("supports document IDs and exact-one source validation", () => {
  const ids = parseCli(
    ["extract", "--id", "document-id", "--ids", '["document-two"]', "--text"],
    env,
  );
  assert.equal(ids.kind, "run");
  if (ids.kind === "run") {
    assert.deepEqual(ids.options.request, {
      ids: ["document-id", "document-two"],
      text: { maxCharacters: 10_000 },
    });
  }

  assert.throws(
    () =>
      parseCli(
        ["extract", "--body", '{"ids":["id"],"urls":["https://example.com"],"highlights":true}'],
        env,
      ),
    (error: unknown) => error instanceof CliError && error.message.includes("exactly one"),
  );
});

test("rejects ambiguous options, unsupported combinations, and deprecated fields", () => {
  assert.throws(
    () => parseCli(["search", "--query", "--type", "auto"], env),
    (error: unknown) => error instanceof CliError && error.message.includes("requires a value"),
  );
  assert.throws(
    () => parseCli(["search", "one", "--query", "two"], env),
    (error: unknown) => error instanceof CliError && error.message.includes("not both"),
  );
  assert.throws(
    () => parseCli(["search", "query", "--output", "response.json", "--temp-output"], env),
    (error: unknown) => error instanceof CliError && error.message.includes("not both"),
  );
  assert.throws(
    () => parseCli(["search", "query", "--stream", "--temp-output"], env),
    (error: unknown) => error instanceof CliError && error.message.includes("--stream"),
  );
  assert.throws(
    () => parseCli(["search", "query", "--additional-query", "variation"], env),
    (error: unknown) => error instanceof CliError && error.message.includes("deep search"),
  );
  assert.throws(
    () =>
      parseCli(["search", "query", "--category", "people", "--exclude-domain", "example.com"], env),
    (error: unknown) => error instanceof CliError && error.message.includes("does not support"),
  );
  assert.throws(
    () => parseCli(["search", "--body", '{"query":"query","startCrawlDate":null}'], env),
    (error: unknown) => error instanceof CliError && error.message.includes("deprecated"),
  );
  assert.throws(
    () =>
      parseCli(
        ["extract", "--body", '{"urls":["https://example.com"],"highlights":{"numSentences":3}}'],
        env,
      ),
    (error: unknown) => error instanceof CliError && error.message.includes("deprecated"),
  );
});

test("rejects requests outside the current contract", () => {
  const invalidArguments = [
    ["search", "query", "--category", "research paper"],
    ["search", "query", "--compliance", "other"],
    ["search", "query", "--text-max-characters", "10001"],
    ["search", "query", "--highlight-max-characters", "10001"],
    ["search", "query", "--livecrawl-timeout", "90001"],
    ["search", "query", "--max-age-hours", "721"],
    ["search", "query", "--subpages", "101"],
    ["search", "query", "--links", "1001"],
    ["search", "query", "--start-published-date", "2026-01-01"],
  ];

  for (const arguments_ of invalidArguments) {
    assert.throws(() => parseCli(arguments_, env), CliError, JSON.stringify(arguments_));
  }

  const invalidBodies = [
    { additionalQueries: [], query: "query", type: "deep" },
    {
      additionalQueries: Array.from({ length: 11 }, () => "variation"),
      query: "query",
      type: "deep",
    },
    { outputSchema: false, query: "query" },
    { outputSchema: { type: "array" }, query: "query" },
    { contents: { summary: true }, query: "query" },
    { contents: { extras: { codeBlocks: 1001 } }, query: "query" },
    { contents: { subpageTarget: "x".repeat(101) }, query: "query" },
  ];

  for (const body of invalidBodies) {
    assert.throws(
      () => parseCli(["search", "--body", JSON.stringify(body)], env),
      CliError,
      JSON.stringify(body),
    );
  }
});

test("supports short aliases and explicit disabling overrides", () => {
  const search = parseCli(
    [
      "search",
      "-q",
      "query",
      "-n",
      "1",
      "-t",
      "fast",
      "--exclude-domains",
      '["example.com"]',
      "--no-highlights",
      "--no-text",
      "--no-summary",
      "--format",
      "urls",
      "--base-url",
      "https://search.example.test/v1",
      "--timeout-ms",
      "1000",
      "--dry-run",
    ],
    {},
  );
  assert.equal(search.kind, "run");
  if (search.kind === "run") {
    assert.equal(search.options.baseUrl, "https://search.example.test/v1");
    assert.equal(search.options.format, "urls");
    assert.equal(search.options.timeoutMs, 1000);
    assert.deepEqual(search.options.request["contents"], {
      highlights: false,
      summary: null,
      text: false,
    });
  }

  const extract = parseCli(
    ["extract", "https://example.com", "--allow-partial", "--fail-on-errors"],
    env,
  );
  assert.equal(extract.kind, "run");
  if (extract.kind === "run") {
    assert.equal(extract.options.failOnErrors, true);
  }
});

test("exposes machine-readable schemas with CLI defaults", () => {
  const search: JsonObject = requestSchema("search");
  assert.deepEqual(search["required"], ["query"]);
  const searchProperties = search["properties"];
  assert.ok(isJsonObject(searchProperties));
  assert.deepEqual(searchProperties["type"], {
    anyOf: [
      {
        default: "auto",
        enum: ["instant", "fast", "auto", "deep-lite", "deep", "deep-reasoning"],
        type: "string",
      },
      { type: "null" },
    ],
  });
  const numResults = searchProperties["numResults"];
  assert.ok(isJsonObject(numResults));
  const alternatives = numResults["anyOf"];
  assert.ok(Array.isArray(alternatives));
  const numericSchema = alternatives[0];
  assert.ok(isJsonObject(numericSchema));
  assert.equal(numericSchema["default"], 5);

  const extract: JsonObject = requestSchema("extract");
  assert.deepEqual(extract["oneOf"], [{ required: ["urls"] }, { required: ["ids"] }]);
});

test("documents agent-oriented defaults and the complete command surface", () => {
  const global = helpText();
  assert.match(global, /explicit|Commands:/);
  assert.match(global, /5 results/);
  assert.match(global, /private temporary file/);
  assert.match(global, /Exit codes/);

  const search = helpText("search");
  for (const option of [
    "--no-moderation",
    "--additional-queries",
    "--output-schema",
    "--highlight-query",
    "--text",
    "--summary",
    "--rich-image-links",
    "--code-blocks",
  ]) {
    assert.match(search, new RegExp(option));
  }
  assert.match(search, /Prefer highlights for agent workflows/);

  const extract = helpText("extract");
  assert.match(extract, /--allow-partial/);
  assert.match(extract, /HTTP 200 with per-URL failures/);
});

test("reports the package version", () => {
  const packageJson: unknown = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.ok(isJsonObject(packageJson));
  assert.ok(isString(packageJson["version"]));
  assert.equal(VERSION, packageJson["version"]);
});

test("formats URLs, content, grounding, statuses, and metadata", () => {
  const response = {
    costDollars: { total: 0.007 },
    output: {
      content: "Synthesized answer",
      grounding: [
        {
          citations: [{ title: "Source", url: "https://example.com/source" }],
          confidence: "high",
          field: "content",
        },
      ],
    },
    requestId: "request_123",
    results: [
      {
        highlights: ["First highlight\nsecond line"],
        publishedDate: "2026-08-03",
        summary: { answer: "Summary" },
        text: "Page text",
        title: "One",
        url: "https://example.com/one",
      },
    ],
    statuses: [
      { id: "https://example.com/one", source: "cached", status: "success" },
      {
        error: { httpStatusCode: 404, tag: "CRAWL_NOT_FOUND" },
        id: "https://example.com/missing",
        status: "error",
      },
    ],
  };

  assert.equal(formatResponse(response, "urls", false), "https://example.com/one");
  const text = formatResponse(response, "text", false);
  assert.match(text, /Synthesized answer/);
  assert.match(text, /Source — https:\/\/example\.com\/source/);
  assert.match(text, /Highlights:/);
  assert.match(text, /Summary: \{/);
  assert.match(text, /Text: Page text/);
  assert.match(text, /CRAWL_NOT_FOUND, HTTP 404/);
  assert.match(text, /requestId: request_123/);
  assert.match(text, /costDollars.total: 0.007/);
  assert.equal(hasContentErrors(response), true);
  assert.equal(contentResponseErrors(response).length, 1);
});

test("references every public parser option in behavioral coverage", () => {
  const parserSource = readFileSync("src/core.ts", "utf8");
  const behavioralTests = [
    "test/artifact.test.ts",
    "test/cli.test.ts",
    "test/core.test.ts",
    "test/integration/contents.test.ts",
    "test/integration/search.test.ts",
  ]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const parserOptions = [...parserSource.matchAll(/case "(-{1,2}[A-Za-z][A-Za-z-]*)":/g)].map(
    (match) => match[1],
  );
  const uncovered = [...new Set(parserOptions)].filter(
    (option) =>
      option !== undefined &&
      !behavioralTests.includes(`"${option}"`) &&
      !behavioralTests.includes(`\`${option}\``),
  );

  assert.deepEqual(uncovered, []);
});
