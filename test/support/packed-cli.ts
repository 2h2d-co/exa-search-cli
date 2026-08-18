import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isJsonObject, isString, type JsonObject } from "../../src/core.ts";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export type CommandResult = {
  status: number | null;
  stderr: string;
  stdout: string;
};

export type PackedCli = {
  cleanup: () => void;
  cliPath: string;
  packageRoot: string;
  packageTarball: string;
};

type RunOptions = {
  env?: Record<string, string>;
  input?: string;
  unsetEnv?: string[];
};

export function buildAndUnpackPackedCli(): PackedCli {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "exa-search-packed-test-"));

  try {
    const sourceRoot = join(temporaryRoot, "source");
    const packRoot = join(temporaryRoot, "pack");
    const unpackRoot = join(temporaryRoot, "unpack");
    mkdirSync(sourceRoot);
    mkdirSync(packRoot);
    mkdirSync(unpackRoot);

    copyWorkingTree(sourceRoot);
    symlinkSync(join(repositoryRoot, "node_modules"), join(sourceRoot, "node_modules"), "dir");
    runChecked(
      process.execPath,
      [
        join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"),
        "-p",
        "tsconfig.build.json",
      ],
      sourceRoot,
    );

    const packResult = runNpmChecked(
      ["pack", "--json", "--pack-destination", packRoot, "--allow-directory=all"],
      sourceRoot,
    );
    const packOutput: unknown = JSON.parse(packResult.stdout);
    if (!Array.isArray(packOutput) || !isJsonObject(packOutput[0])) {
      throw new Error("npm pack did not return package metadata");
    }

    const filename = packOutput[0]["filename"];
    if (!isString(filename) || filename.length === 0) {
      throw new Error("npm pack did not return a tarball filename");
    }

    const packageTarball = join(packRoot, filename);
    runChecked("tar", ["-xzf", packageTarball, "-C", unpackRoot], temporaryRoot);

    const packageRoot = join(unpackRoot, "package");
    const cliPath = join(packageRoot, "bin", "exa-search.js");
    if (!existsSync(cliPath) || !existsSync(join(packageRoot, "dist", "cli.js"))) {
      throw new Error("Packed package is missing its CLI or compiled runtime");
    }

    return {
      cleanup: () => {
        rmSync(temporaryRoot, { force: true, recursive: true });
      },
      cliPath,
      packageRoot,
      packageTarball,
    };
  } catch (error) {
    rmSync(temporaryRoot, { force: true, recursive: true });
    throw error;
  }
}

export function runPackedCli(
  packedCli: PackedCli,
  args: string[],
  options: RunOptions = {},
): CommandResult {
  const env = { ...process.env, ...options.env };
  for (const name of options.unsetEnv ?? []) {
    delete env[name];
  }

  const result = spawnSync(packedCli.cliPath, args, {
    encoding: "utf8",
    env,
    input: options.input,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

export function readPackedManifest(packedCli: PackedCli): JsonObject {
  const manifest: unknown = JSON.parse(
    readFileSync(join(packedCli.packageRoot, "package.json"), "utf8"),
  );
  if (!isJsonObject(manifest)) {
    throw new Error("Packed package manifest is not an object");
  }

  return manifest;
}

export function parseJsonObject(output: string, description: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch (error) {
    throw new Error(`${description} was not valid JSON`, { cause: error });
  }

  if (!isJsonObject(value)) {
    throw new Error(`${description} was not a JSON object`);
  }

  return value;
}

export function assertCliSuccess(result: CommandResult, description: string): void {
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(
      `${description} exited ${String(result.status)}${stderr === "" ? "" : `: ${stderr.slice(0, 1000)}`}`,
    );
  }
}

function copyWorkingTree(destination: string): void {
  const files = runChecked(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    repositoryRoot,
  ).stdout.split("\0");

  for (const relativePath of files) {
    if (relativePath === "") {
      continue;
    }

    const target = join(destination, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(repositoryRoot, relativePath), target, { recursive: true });
  }
}

function runNpmChecked(args: string[], cwd: string): CommandResult {
  const npmExecPath = process.env["npm_execpath"];
  if (npmExecPath === undefined || npmExecPath === "") {
    return runChecked("npm", args, cwd);
  }

  return runChecked(process.execPath, [npmExecPath, ...args], cwd);
}

function runChecked(command: string, args: string[], cwd: string): CommandResult {
  const env = { ...process.env };
  delete env["EXA_API_KEY"];
  delete env["EXA_BASE_URL"];

  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} exited ${String(result.status)}: ${result.stderr.trim().slice(0, 2000)}`,
    );
  }

  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}
