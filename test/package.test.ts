import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

void test("packages an agent skill with bounded and safe CLI guidance", () => {
  const packageJson: unknown = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(isRecord(packageJson));
  assert.ok(Array.isArray(packageJson["files"]));
  assert.ok(packageJson["files"].includes("skills"));

  const skill = readFileSync("skills/exa-search-cli/SKILL.md", "utf8");
  assert.match(skill, /^name: exa-search-cli$/m);
  assert.match(skill, /allowed-tools: Bash\(exa-search:\*\)/);
  assert.match(skill, /defaults to Exa `auto`, 5 results/);
  assert.match(skill, /--temp-output/);
  assert.match(skill, /Exit code 6/);
  assert.match(skill, /untrusted data/);
  assert.match(skill, /never expose `EXA_API_KEY`/);
  assert.match(skill, /Cite factual claims with returned URLs/);
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
