import assert from "node:assert/strict";
import test from "node:test";
import { CliError, formatResponse, parseCli } from "../src/core.ts";

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
      '{"query":"from body","numResults":2,"contents":{"summary":true}}',
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
      summary: true,
    },
    numResults: 5,
    query: "from body",
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
