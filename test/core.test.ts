import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CliError, formatResponse, helpText, parseCli, VERSION } from "../src/core.ts";

const env = { EXA_API_KEY: "test-key" };

void test("builds a default highlights request from positional query", () => {
  const command = parseCli(["--num-results", "3", "latest", "LLM", "news"], env);
  assert.equal(command.kind, "run");

  if (command.kind !== "run") {
    return;
  }

  assert.deepEqual(command.options.request, {
    contents: { highlights: true },
    numResults: 3,
    query: "latest LLM news",
  });
  assert.equal(command.options.apiKey, "test-key");
  assert.equal(command.options.baseUrl, "https://api.exa.ai");
});

void test("uses explicit content modes instead of default highlights", () => {
  const command = parseCli(
    ["--query", "architecture", "--text", "--text-max-characters", "5000"],
    env,
  );
  assert.equal(command.kind, "run");

  if (command.kind !== "run") {
    return;
  }

  assert.deepEqual(command.options.request, {
    contents: { text: { maxCharacters: 5000 } },
    query: "architecture",
  });
});

void test("merges body as a base request and lets cli flags override", () => {
  const command = parseCli(
    [
      "--body",
      '{"query":"from body","numResults":2,"contents":{"summary":{}}}',
      "--num-results",
      "5",
      "--max-age-hours",
      "0",
    ],
    env,
  );
  assert.equal(command.kind, "run");

  if (command.kind !== "run") {
    return;
  }

  assert.deepEqual(command.options.request, {
    contents: {
      maxAgeHours: 0,
      summary: {},
    },
    numResults: 5,
    query: "from body",
  });
});

void test("uses OpenAPI category, summary, extras, and boundary values", () => {
  const command = parseCli(
    [
      "research",
      "--category",
      "publication",
      "--summary",
      "--additional-query",
      "papers",
      "--text-max-characters",
      "10000",
      "--highlight-max-characters",
      "10000",
      "--livecrawl-timeout",
      "90000",
      "--max-age-hours",
      "720",
      "--subpages",
      "100",
      "--links",
      "1000",
      "--image-links",
      "1000",
      "--rich-image-links",
      "1000",
      "--rich-links",
      "1000",
      "--code-blocks",
      "1000",
      "--compliance",
      "hipaa",
    ],
    env,
  );
  assert.equal(command.kind, "run");

  if (command.kind !== "run") {
    return;
  }

  assert.deepEqual(command.options.request, {
    additionalQueries: ["papers"],
    category: "publication",
    compliance: "hipaa",
    contents: {
      extras: {
        codeBlocks: 1000,
        imageLinks: 1000,
        links: 1000,
        richImageLinks: 1000,
        richLinks: 1000,
      },
      highlights: { maxCharacters: 10000 },
      livecrawlTimeout: 90000,
      maxAgeHours: 720,
      subpages: 100,
      summary: {},
      text: { maxCharacters: 10000 },
    },
    query: "research",
  });
});

void test("rejects unsupported filters for company and people categories", () => {
  assert.throws(
    () =>
      parseCli(["--category", "company", "--exclude-domain", "example.com", "sales tools"], env),
    (error: unknown) =>
      error instanceof CliError && error.message.includes("company category does not support"),
  );
});

void test("rejects requests outside the OpenAPI contract", () => {
  const invalidArgumentLists = [
    ["query", "--category", "research paper"],
    ["query", "--compliance", "other"],
    ["query", "--text-max-characters", "10001"],
    ["query", "--highlight-max-characters", "10001"],
    ["query", "--livecrawl-timeout", "90001"],
    ["query", "--max-age-hours", "721"],
    ["query", "--subpages", "101"],
    ["query", "--links", "1001"],
    ["query", "--start-published-date", "2025-01-01"],
  ];

  for (const arguments_ of invalidArgumentLists) {
    assert.throws(() => parseCli(arguments_, env), CliError, JSON.stringify(arguments_));
  }

  const invalidBodies = [
    { query: "query", additionalQueries: [] },
    { query: "query", additionalQueries: Array.from({ length: 11 }, () => "variation") },
    { query: "query", compliance: "other" },
    { query: "query", outputSchema: false },
    { query: "query", outputSchema: { type: "array" } },
    { query: "query", startPublishedDate: 42 },
    { query: "query", contents: { summary: true } },
    { query: "query", contents: { extras: { codeBlocks: 1001 } } },
    { query: "query", contents: { subpageTarget: "x".repeat(101) } },
  ];

  for (const body of invalidBodies) {
    assert.throws(
      () => parseCli(["--body", JSON.stringify(body)], env),
      CliError,
      JSON.stringify(body),
    );
  }
});

void test("accepts nullable OpenAPI request fields and RFC 3339 publication dates", () => {
  const command = parseCli(
    [
      "--body",
      JSON.stringify({
        category: null,
        contents: null,
        endPublishedDate: null,
        outputSchema: null,
        query: "query",
        startPublishedDate: "2025-01-01T00:00:00Z",
        stream: null,
      }),
    ],
    env,
  );

  assert.equal(command.kind, "run");
});

void test("help documents every supported public option", () => {
  const help = helpText();
  for (const option of [
    "--api-key",
    "--base-url",
    "--no-moderation",
    "--compliance",
    "--rich-image-links",
    "--rich-links",
    "--code-blocks",
  ]) {
    assert.match(help, new RegExp(option));
  }
});

void test("reports the package version", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    version: string;
  };
  assert.equal(VERSION, packageJson.version);
});

void test("formats urls output", () => {
  const output = formatResponse(
    {
      results: [
        { title: "One", url: "https://example.com/one" },
        { title: "Two", url: "https://example.com/two" },
      ],
    },
    "urls",
    false,
  );

  assert.equal(output, "https://example.com/one\nhttps://example.com/two");
});

void test("formats requested text alongside summaries and highlights", () => {
  const output = formatResponse(
    {
      results: [
        {
          highlights: [],
          summary: "Summary",
          text: "Page text",
          title: "One",
          url: "https://example.com/one",
        },
      ],
    },
    "text",
    false,
  );

  assert.match(output, /Summary: Summary/);
  assert.match(output, /Text: Page text/);
});
