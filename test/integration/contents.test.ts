import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CliError,
  type CliRunOptions,
  contentsJson,
  hasContentErrors,
  isJsonObject,
  isJsonValue,
  isString,
  type JsonObject,
  type JsonValue,
  parseCli,
} from "../../src/core.ts";

const CONTENTS_DOC_URL = "https://exa.ai/docs/reference/contents-api-guide-for-coding-agents";
const skipWithoutApiKey = process.env["EXA_API_KEY"] ? false : "EXA_API_KEY is not set";

void test(
  "extracts combined content modes from the live Contents API",
  { skip: skipWithoutApiKey },
  async () => {
    const response = await contentsJson(
      parseLiveOptions([
        "extract",
        CONTENTS_DOC_URL,
        "--text-max-characters",
        "1000",
        "--highlight-query",
        "request parameters and response statuses",
        "--summary-query",
        "Summarize the Contents API in one sentence.",
        "--links",
        "1",
        "--timeout",
        "90000",
      ]),
    );

    assert.equal(hasContentErrors(response), false);
    const results = responseResults(response);
    assert.equal(results.length, 1);
    assert.ok(requiredString(results[0], "text").length > 0);
    assert.ok(requiredString(results[0], "summary").length > 0);
    assert.ok(requiredStringArray(results[0], "highlights").length > 0);

    const statuses = responseStatuses(response);
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0]?.["status"], "success");
  },
);

void test(
  "extracts a live document through the ids request field",
  { skip: skipWithoutApiKey },
  async () => {
    const response = await contentsJson(
      parseLiveOptions([
        "extract",
        "--id",
        CONTENTS_DOC_URL,
        "--text-max-characters",
        "300",
        "--timeout",
        "90000",
      ]),
    );

    assert.equal(hasContentErrors(response), false);
    assert.equal(responseResults(response).length, 1);
    assert.equal(responseStatuses(response)[0]?.["status"], "success");
  },
);

void test(
  "reports per-URL failures from the live Contents API",
  { skip: skipWithoutApiKey },
  async () => {
    const execution = await runCli([
      "extract",
      "mailto:test@example.com",
      "--compact",
      "--timeout",
      "90000",
    ]);

    assert.equal(execution.exitCode, 6);
    const error: unknown = JSON.parse(execution.stderr);
    assert.ok(isJsonObject(error));
    assert.equal(error["type"], "error");
    assert.ok(isJsonObject(error["error"]));
    assert.equal(error["error"]["kind"], "partial");
    const response: unknown = JSON.parse(execution.stdout);
    assert.ok(isJsonValue(response));
    assert.equal(hasContentErrors(response), true);
    const statuses = responseStatuses(response);
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0]?.["status"], "error");
    assert.ok(isJsonObject(statuses[0]?.["error"]));
  },
);

void test(
  "surfaces request errors from the live Contents API",
  { skip: skipWithoutApiKey },
  async () => {
    const options = parseLiveOptions(["extract", CONTENTS_DOC_URL]);
    options.request = { ...options.request, ids: [CONTENTS_DOC_URL] };

    await assert.rejects(
      contentsJson(options),
      (error: unknown) => error instanceof CliError && /^(400|422) /.test(error.message),
    );
  },
);

async function runCli(arguments_: string[]): Promise<{
  exitCode: number | null;
  stderr: string;
  stdout: string;
}> {
  const cliPath = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
  const child = spawn(process.execPath, [cliPath, ...arguments_], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return {
    exitCode,
    stderr: Buffer.concat(stderr).toString("utf8"),
    stdout: Buffer.concat(stdout).toString("utf8"),
  };
}

function parseLiveOptions(arguments_: string[]): CliRunOptions {
  const apiKey = process.env["EXA_API_KEY"];
  assert.ok(apiKey, "EXA_API_KEY must be set for live integration tests");

  const command = parseCli(arguments_, { EXA_API_KEY: apiKey });
  assert.equal(command.kind, "run");
  return command.options;
}

function responseResults(response: JsonValue): JsonObject[] {
  assert.ok(isJsonObject(response));
  assert.ok(Array.isArray(response["results"]));
  return response["results"].filter(isJsonObject);
}

function responseStatuses(response: JsonValue): JsonObject[] {
  assert.ok(isJsonObject(response));
  assert.ok(Array.isArray(response["statuses"]));
  return response["statuses"].filter(isJsonObject);
}

function requiredString(record: JsonObject | undefined, field: string): string {
  assert.ok(record);
  const value = record[field];
  assert.ok(isString(value));
  return value;
}

function requiredStringArray(record: JsonObject | undefined, field: string): string[] {
  assert.ok(record);
  const value = record[field];
  assert.ok(Array.isArray(value));
  assert.ok(value.every(isString));
  return value;
}
