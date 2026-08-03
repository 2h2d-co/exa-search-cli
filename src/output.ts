import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { chmodSync, linkSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { CliError } from "./core.ts";

export type OutputReceipt = {
  bytes: number;
  output: string;
};

export function writeTemporaryOutputFile(
  endpoint: "search" | "extract",
  format: "json" | "text" | "urls",
  content: string,
): OutputReceipt {
  let directory: string;
  try {
    directory = mkdtempSync(join(tmpdir(), "exa-search-"));
    chmodSync(directory, 0o700);
  } catch (error) {
    throw new CliError(
      `Could not create temporary output directory: ${error instanceof Error ? error.message : String(error)}`,
      { kind: "output" },
    );
  }

  const filename = format === "json" ? `${endpoint}.json` : `${endpoint}-${format}.txt`;
  try {
    return writeOutputFile(join(directory, filename), content);
  } catch (error) {
    rmSync(directory, { force: true, recursive: true });
    throw error;
  }
}

export function writeOutputFile(path: string, content: string): OutputReceipt {
  const output = resolve(path);
  const directory = dirname(output);
  const temporary = resolve(directory, `.${basename(output)}.${process.pid}.${randomUUID()}.tmp`);

  try {
    writeFileSync(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    chmodSync(temporary, 0o600);
    linkSync(temporary, output);
  } catch (error) {
    const code = nodeErrorCode(error);
    const message =
      code === "EEXIST"
        ? `Output file already exists: ${output}`
        : `Could not write output file: ${error instanceof Error ? error.message : String(error)}`;
    throw new CliError(message, { kind: "output" });
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file was already removed or was never created.
    }
  }

  return {
    bytes: Buffer.byteLength(content),
    output,
  };
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
}
