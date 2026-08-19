#!/usr/bin/env node
import {
  apiJson,
  CliError,
  contentResponseErrors,
  errorFormatFromArgv,
  formatCliError,
  formatResponse,
  helpText,
  parseCli,
  requestPreview,
  streamSearch,
  VERSION,
} from "./core.ts";
import { writeOutputFile, writeTemporaryOutputFile } from "./output.ts";
import { requestSchema } from "./schema.ts";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const errorFormat = errorFormatFromArgv(argv, process.stderr.isTTY === true ? "text" : "json");

  try {
    const command = parseCli(argv, process.env);

    if (command.kind === "help") {
      process.stdout.write(`${helpText(command.endpoint)}\n`);
      return;
    }

    if (command.kind === "version") {
      process.stdout.write(`${VERSION}\n`);
      return;
    }

    if (command.kind === "schema") {
      process.stdout.write(
        `${formatResponse(requestSchema(command.endpoint), "json", process.stdout.isTTY !== true)}\n`,
      );
      return;
    }

    if (!command.options.dryRun && command.options.stream) {
      await streamSearch(command.options, (chunk) => process.stdout.write(chunk));
      process.stdout.write("\n");
      return;
    }

    const response = command.options.dryRun
      ? requestPreview(command.options)
      : await apiJson(command.options);
    const format = command.options.dryRun ? "json" : command.options.format;
    const writesFile = command.options.outputPath !== undefined || command.options.temporaryOutput;
    const compact = command.options.compact ?? (writesFile || process.stdout.isTTY !== true);
    const content = `${formatResponse(response, format, compact)}\n`;

    if (command.options.temporaryOutput) {
      const receipt = writeTemporaryOutputFile(command.endpoint, format, content);
      process.stdout.write(`${receipt.output}\n`);
    } else if (command.options.outputPath !== undefined) {
      const receipt = writeOutputFile(command.options.outputPath, content);
      process.stdout.write(`${JSON.stringify({ ...receipt, type: "output" })}\n`);
    } else {
      process.stdout.write(content);
    }

    const contentErrors = contentResponseErrors(response);
    if (!command.options.dryRun && command.options.failOnErrors && contentErrors.length > 0) {
      throw new CliError(
        `Extract completed with ${contentErrors.length} URL error${contentErrors.length === 1 ? "" : "s"}`,
        { detail: contentErrors, kind: "partial" },
      );
    }
    // oxlint-disable-next-line 2h2d/no-silent-error-suppression -- The CLI boundary renders failures and converts them to process exit codes.
  } catch (error) {
    const cliError =
      error instanceof CliError
        ? error
        : new CliError(error instanceof Error ? error.message : String(error), {
            cause: error,
            kind: "internal",
          });
    const formatted = formatCliError(cliError, errorFormat);
    process.stderr.write(errorFormat === "json" ? `${formatted}\n` : `exa-search: ${formatted}\n`);
    process.exitCode = cliError.exitCode;
  }
}

await main();
