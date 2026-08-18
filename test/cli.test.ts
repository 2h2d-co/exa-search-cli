import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

void test("writes output atomically and refuses to replace existing files", () => {
  const directory = mkdtempSync(join(tmpdir(), "exa-search-cli-test-"));
  const output = join(directory, "preview.json");

  try {
    const first = runCliSync(["search", "Exa Search API", "--dry-run", "--output", output]);
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(JSON.parse(first.stdout), {
      bytes: Buffer.byteLength(readFileSync(output, "utf8")),
      output,
      type: "output",
    });
    assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), {
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
    assert.equal(statSync(output).mode & 0o777, 0o600);

    const second = runCliSync(["search", "Exa Search API", "--dry-run", "-o", output]);
    assert.equal(second.status, 7);
    assert.match(second.stderr, /Output file already exists/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

void test("writes to a generated private temporary file and returns only its path", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "exa-search-temp-output-test-"));

  try {
    const result = runCliSync(
      ["extract", "https://example.com", "--dry-run", "--temp-output", "--pretty"],
      { TMPDIR: temporaryRoot },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");

    const output = result.stdout.trim();
    assert.equal(dirname(dirname(output)), temporaryRoot);
    assert.match(output, /\/exa-search-[^/]+\/extract\.json$/);
    assert.equal(statSync(dirname(output)).mode & 0o777, 0o700);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.match(readFileSync(output, "utf8"), /\n  "endpoint": "contents"/);
    assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), {
      endpoint: "contents",
      method: "POST",
      request: {
        highlights: true,
        urls: ["https://example.com"],
      },
      timeout_ms: 60_000,
      url: "https://api.exa.ai/contents",
    });
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
});

void test("uses compact JSON and structured errors outside an interactive terminal", () => {
  const preview = runCliSync(["search", "Exa Search API", "--dry-run"]);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(preview.stdout, `${JSON.stringify(JSON.parse(preview.stdout))}\n`);

  const usage = runCliSync(["search", "--query", "--type", "auto"]);
  assert.equal(usage.status, 2);
  assert.deepEqual(JSON.parse(usage.stderr), {
    error: {
      kind: "usage",
      message: '--query requires a value; use --query=<value> when the value starts with "-"',
    },
    type: "error",
  });

  const auth = runCliSync(["search", "Exa Search API", "--json"]);
  assert.equal(auth.status, 3);
  assert.equal(JSON.parse(auth.stderr).error.kind, "auth");

  const text = runCliSync(["search", "Exa Search API", "--error-format", "text"]);
  assert.equal(text.status, 3);
  assert.match(text.stderr, /^exa-search: Missing API key/);
});

type CliResult = {
  status: number | null;
  stderr: string;
  stdout: string;
};

function runCliSync(args: string[], extraEnv: Record<string, string> = {}): CliResult {
  const env = { ...process.env, ...extraEnv };
  delete env["EXA_API_KEY"];
  delete env["EXA_BASE_URL"];
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    env,
  });
  if (result.error) {
    throw result.error;
  }

  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}
