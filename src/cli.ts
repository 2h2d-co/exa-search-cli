#!/usr/bin/env node
import {
  CliError,
  formatResponse,
  helpText,
  parseCli,
  searchJson,
  streamSearch,
  VERSION,
} from "./core.ts";

async function main(): Promise<void> {
  try {
    const command = parseCli(process.argv.slice(2), process.env);

    if (command.kind === "help") {
      process.stdout.write(`${helpText()}\n`);
      return;
    }

    if (command.kind === "version") {
      process.stdout.write(`${VERSION}\n`);
      return;
    }

    if (command.options.stream) {
      await streamSearch(command.options, (chunk) => process.stdout.write(chunk));
      process.stdout.write("\n");
      return;
    }

    const response = await searchJson(command.options);
    process.stdout.write(
      `${formatResponse(response, command.options.format, command.options.compact)}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`exa-search: ${message}\n`);
    process.exitCode = error instanceof CliError ? error.exitCode : 1;
  }
}

await main();
