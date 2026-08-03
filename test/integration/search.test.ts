import assert from "node:assert/strict";
import test from "node:test";
import {
  CliError,
  type CliRunOptions,
  parseCli,
  searchJson,
  streamSearch,
} from "../../src/core.ts";

const skipWithoutApiKey = process.env["EXA_API_KEY"] ? false : "EXA_API_KEY is not set";

void test(
  "searches the live publication index with a generated summary",
  { skip: skipWithoutApiKey },
  async () => {
    const response = await searchJson(
      parseLiveOptions([
        "Attention Is All You Need transformer architecture paper",
        "--type",
        "instant",
        "--category",
        "publication",
        "--num-results",
        "1",
        "--summary",
        "--timeout",
        "90000",
      ]),
    );

    const results = responseResults(response);
    assert.equal(results.length, 1);
    assert.match(requiredString(results[0], "url"), /^https?:\/\//);
    assert.ok(requiredString(results[0], "title").length > 0);
    assert.ok(requiredString(results[0], "summary").length > 0);
  },
);

void test(
  "receives the live JSON response when stream has no outputSchema",
  { skip: skipWithoutApiKey },
  async () => {
    let output = "";
    await streamSearch(
      parseLiveOptions([
        "Exa Search API documentation",
        "--type",
        "instant",
        "--include-domain",
        "exa.ai/docs",
        "--num-results",
        "1",
        "--stream",
        "--compact",
        "--timeout",
        "90000",
      ]),
      (chunk) => {
        output += chunk;
      },
    );

    assert.equal(responseResults(JSON.parse(output) as unknown).length, 1);
  },
);

void test("streams synthesized text from the live API", { skip: skipWithoutApiKey }, async () => {
  let chunks = 0;
  let output = "";
  await streamSearch(
    parseLiveOptions([
      "What does the Exa Search API do?",
      "--type",
      "instant",
      "--include-domain",
      "exa.ai",
      "--num-results",
      "1",
      "--output-schema",
      '{"type":"text","description":"Answer in one short sentence."}',
      "--stream",
      "--timeout",
      "90000",
    ]),
    (chunk) => {
      chunks += 1;
      output += chunk;
    },
  );

  assert.ok(chunks > 0);
  assert.ok(output.trim().length > 0);
});

void test("surfaces validation errors from the live API", { skip: skipWithoutApiKey }, async () => {
  const options = parseLiveOptions(["invalid request test", "--type", "instant"]);
  options.request = { ...options.request, numResults: 0 };

  await assert.rejects(
    searchJson(options),
    (error: unknown) => error instanceof CliError && /^(400|422) /.test(error.message),
  );
});

function parseLiveOptions(arguments_: string[]): CliRunOptions {
  const apiKey = process.env["EXA_API_KEY"];
  assert.ok(apiKey, "EXA_API_KEY must be set for live integration tests");

  const command = parseCli(arguments_, { EXA_API_KEY: apiKey });
  assert.equal(command.kind, "run");
  return command.options;
}

function responseResults(response: unknown): Record<string, unknown>[] {
  assert.ok(isRecord(response));
  assert.ok(Array.isArray(response["results"]));
  return response["results"].filter(isRecord);
}

function requiredString(record: Record<string, unknown> | undefined, field: string): string {
  assert.ok(record);
  const value = record[field];
  assert.ok(typeof value === "string");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
