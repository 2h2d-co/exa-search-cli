#!/usr/bin/env node
import {
  CliError,
  contentsJson,
  formatResponse,
  hasContentErrors,
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
      process.stdout.write(`${helpText(command.topic)}\n`);
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

    const response =
      command.options.endpoint === "contents"
        ? await contentsJson(command.options)
        : await searchJson(command.options);
    process.stdout.write(
      `${formatResponse(response, command.options.format, command.options.compact)}\n`,
    );
    if (command.options.endpoint === "contents" && hasContentErrors(response)) {
      process.exitCode = 2;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`exa-search: ${message}\n`);
    process.exitCode = error instanceof CliError ? error.exitCode : 1;
  }
}

await main();
