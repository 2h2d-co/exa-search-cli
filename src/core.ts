import { readFileSync } from "node:fs";

export const VERSION = readPackageVersion();

const SEARCH_TYPES = ["auto", "fast", "instant", "deep-lite", "deep", "deep-reasoning"] as const;
const DEEP_SEARCH_TYPES = ["deep-lite", "deep", "deep-reasoning"] as const;
const CATEGORIES = [
  "company",
  "publication",
  "news",
  "personal site",
  "financial report",
  "people",
] as const;
const COMPLIANCE_MODES = ["hipaa"] as const;
const TEXT_VERBOSITIES = ["compact", "standard", "full"] as const;
const TEXT_SECTIONS = [
  "header",
  "navigation",
  "banner",
  "body",
  "sidebar",
  "footer",
  "metadata",
] as const;
const OUTPUT_FORMATS = ["json", "text", "urls"] as const;
const ERROR_FORMATS = ["text", "json"] as const;
const DEFAULT_NUM_RESULTS = 5;
const DEFAULT_TEXT_MAX_CHARACTERS = 10_000;

export type ApiEndpoint = "search" | "contents";
export type CliEndpoint = "search" | "extract";
export type ErrorFormat = "text" | "json";
export type OutputFormat = "json" | "text" | "urls";
export type CliErrorKind =
  | "api"
  | "auth"
  | "internal"
  | "network"
  | "output"
  | "partial"
  | "timeout"
  | "usage";

export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonObject | JsonPrimitive | JsonValue[];

export type JsonObject = {
  [key: string]: JsonValue;
};

export type CliCommand =
  | { endpoint?: CliEndpoint; kind: "help" }
  | { endpoint: CliEndpoint; kind: "schema" }
  | { kind: "version" }
  | {
      endpoint: CliEndpoint;
      kind: "run";
      options: CliRunOptions;
    };

export type CliRunOptions = {
  apiKey: string | undefined;
  baseUrl: string;
  compact: boolean | undefined;
  dryRun: boolean;
  endpoint: ApiEndpoint;
  failOnErrors: boolean;
  format: OutputFormat;
  outputPath: string | undefined;
  request: JsonObject;
  stream: boolean;
  temporaryOutput: boolean;
  timeoutMs: number;
};

type Environment = Record<string, string | undefined>;

type CliIo = {
  readStdin: () => string;
};

type ParseState = {
  additionalQueries: string[];
  apiKey?: string;
  baseUrl?: string;
  bodyBase?: JsonObject;
  compact: boolean | undefined;
  dryRun: boolean;
  endpoint: CliEndpoint;
  excludeDomains: string[];
  failOnErrors: boolean;
  format: OutputFormat;
  generated: JsonObject;
  generatedContents: JsonObject;
  ids: string[];
  includeDomains: string[];
  outputPath?: string;
  positional: string[];
  query?: string;
  temporaryOutput: boolean;
  timeoutMs: number;
  urls: string[];
};

const ERROR_EXIT_CODES = {
  api: 4,
  auth: 3,
  internal: 1,
  network: 5,
  output: 7,
  partial: 6,
  timeout: 5,
  usage: 2,
} satisfies Record<CliErrorKind, number>;

type CliErrorOptions = {
  cause?: unknown;
  detail?: JsonValue;
  kind?: CliErrorKind;
  refId?: string | undefined;
  status?: number | undefined;
};

type FormattedCliErrorDetail = {
  kind: CliErrorKind;
  message: string;
  detail?: JsonValue;
  ref_id?: string;
  status?: number;
};

export class CliError extends Error {
  detail: JsonValue | undefined;
  exitCode: number;
  kind: CliErrorKind;
  refId: string | undefined;
  status: number | undefined;

  constructor(message: string, options: CliErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "CliError";
    this.detail = options.detail;
    this.kind = options.kind ?? "usage";
    this.exitCode = ERROR_EXIT_CODES[this.kind];
    this.refId = options.refId;
    this.status = options.status;
  }
}

export function parseCli(
  argv: readonly string[],
  env: Environment = process.env,
  io: CliIo = { readStdin: () => readFileSync(0, "utf8") },
): CliCommand {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    return { kind: "help" };
  }

  if (argv[0] === "-V" || argv[0] === "--version") {
    return { kind: "version" };
  }

  if (argv[0] === "help") {
    const topic = argv[1];
    if (topic === undefined) {
      return { kind: "help" };
    }
    if ((topic === "search" || topic === "extract") && argv.length === 2) {
      return { endpoint: topic, kind: "help" };
    }

    throw new CliError(`Unknown help topic: ${topic}`);
  }

  if (argv[0] === "schema") {
    const endpoint = argv[1];
    if ((endpoint === "search" || endpoint === "extract") && argv.length === 2) {
      return { endpoint, kind: "schema" };
    }

    throw new CliError("Usage: exa-search schema <search|extract>");
  }

  const endpoint = argv[0];
  if (endpoint !== "search" && endpoint !== "extract") {
    throw new CliError(`Unknown command: ${endpoint}`);
  }

  let stdinConsumed = false;
  const readStdin = (flag: string): string => {
    if (stdinConsumed) {
      throw new CliError(`Standard input can only be read once; ${flag} also requested it`);
    }

    stdinConsumed = true;
    try {
      return io.readStdin();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new CliError(`Could not read ${flag} from standard input: ${reason}`);
    }
  };

  const state: ParseState = {
    additionalQueries: [],
    compact: undefined,
    dryRun: false,
    endpoint,
    excludeDomains: [],
    failOnErrors: endpoint === "extract",
    format: "json",
    generated: {},
    generatedContents: {},
    ids: [],
    includeDomains: [],
    positional: [],
    temporaryOutput: false,
    timeoutMs: 60_000,
    urls: [],
  };

  for (let index = 1; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === undefined) {
      continue;
    }

    if (current === "--") {
      if (state.endpoint === "extract") {
        state.urls.push(...argv.slice(index + 1));
      } else {
        state.positional.push(...argv.slice(index + 1));
      }
      break;
    }

    if (!current.startsWith("-") || current === "-") {
      if (state.endpoint === "extract") {
        state.urls.push(current);
      } else {
        state.positional.push(current === "-" ? readStdin("query").trim() : current);
      }
      continue;
    }

    const flag = splitFlag(current);
    const readValue = (allowDash = false): string => {
      if (flag.inlineValue !== undefined) {
        return flag.inlineValue;
      }

      index += 1;
      const value = argv[index];
      if (value === undefined || (value.startsWith("-") && !(allowDash && value === "-"))) {
        throw new CliError(
          `${flag.name} requires a value; use ${flag.name}=<value> when the value starts with "-"`,
        );
      }

      return value;
    };

    if (applyContentOption(flag.name, readValue, readStdin, state)) {
      continue;
    }

    switch (flag.name) {
      case "-h":
      case "--help":
        return { endpoint, kind: "help" };
      case "-V":
      case "--version":
        return { kind: "version" };
      case "--api-key":
        state.apiKey = readValue();
        break;
      case "--base-url":
        state.baseUrl = readValue();
        break;
      case "--body":
        state.bodyBase = parseJsonObject(readValue(), flag.name, readStdin);
        break;
      case "-q":
      case "--query": {
        ensureEndpoint(state.endpoint, "search", flag.name);
        const value = readValue(true);
        state.query = value === "-" ? readStdin(flag.name).trim() : value;
        break;
      }
      case "-n":
      case "--num-results":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated["numResults"] = parseInteger(readValue(), flag.name, {
          min: 1,
          max: 100,
        });
        break;
      case "-t":
      case "--type":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated["type"] = parseAllowed(readValue(), flag.name, SEARCH_TYPES);
        break;
      case "--category":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated["category"] = parseAllowed(readValue(), flag.name, CATEGORIES);
        break;
      case "--user-location":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated["userLocation"] = parseUserLocation(readValue(), flag.name);
        break;
      case "--include-domain":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.includeDomains.push(readValue());
        break;
      case "--include-domains":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.includeDomains.push(...parseJsonStringArray(readValue(), flag.name, readStdin));
        break;
      case "--exclude-domain":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.excludeDomains.push(readValue());
        break;
      case "--exclude-domains":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.excludeDomains.push(...parseJsonStringArray(readValue(), flag.name, readStdin));
        break;
      case "--start-published-date":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated["startPublishedDate"] = parseDateTime(readValue(), flag.name);
        break;
      case "--end-published-date":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated["endPublishedDate"] = parseDateTime(readValue(), flag.name);
        break;
      case "--moderation":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated["moderation"] = true;
        break;
      case "--no-moderation":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated["moderation"] = false;
        break;
      case "--additional-query":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.additionalQueries.push(readValue());
        break;
      case "--additional-queries":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.additionalQueries.push(...parseJsonStringArray(readValue(), flag.name, readStdin));
        break;
      case "--system-prompt":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated["systemPrompt"] = readValue();
        break;
      case "--output-schema":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated["outputSchema"] = parseJsonObject(readValue(), flag.name, readStdin);
        break;
      case "--stream":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated["stream"] = true;
        break;
      case "--no-stream":
        ensureEndpoint(state.endpoint, "search", flag.name);
        state.generated["stream"] = false;
        break;
      case "--url":
        ensureEndpoint(state.endpoint, "extract", flag.name);
        state.urls.push(readValue());
        break;
      case "--urls":
        ensureEndpoint(state.endpoint, "extract", flag.name);
        state.urls.push(...parseJsonStringArray(readValue(), flag.name, readStdin));
        break;
      case "--id":
        ensureEndpoint(state.endpoint, "extract", flag.name);
        state.ids.push(readValue());
        break;
      case "--ids":
        ensureEndpoint(state.endpoint, "extract", flag.name);
        state.ids.push(...parseJsonStringArray(readValue(), flag.name, readStdin));
        break;
      case "--compliance":
        state.generated["compliance"] = parseAllowed(readValue(), flag.name, COMPLIANCE_MODES);
        break;
      case "--format":
        state.format = parseAllowed(readValue(), flag.name, OUTPUT_FORMATS);
        break;
      case "--json":
        state.format = "json";
        break;
      case "--error-format":
        parseAllowed(readValue(), flag.name, ERROR_FORMATS);
        break;
      case "--json-errors":
        break;
      case "-o":
      case "--output":
        state.outputPath = readValue();
        break;
      case "--temp-output":
        state.temporaryOutput = true;
        break;
      case "--compact":
        state.compact = true;
        break;
      case "--pretty":
        state.compact = false;
        break;
      case "--dry-run":
        state.dryRun = true;
        break;
      case "--fail-on-errors":
        ensureEndpoint(state.endpoint, "extract", flag.name);
        state.failOnErrors = true;
        break;
      case "--allow-partial":
        ensureEndpoint(state.endpoint, "extract", flag.name);
        state.failOnErrors = false;
        break;
      case "--timeout":
      case "--timeout-ms":
        state.timeoutMs = parseInteger(readValue(), flag.name, { min: 1 });
        break;
      default:
        throw new CliError(`Unknown option: ${flag.name}`);
    }
  }

  return buildCommand(state, env);
}

export function helpText(endpoint?: CliEndpoint): string {
  if (endpoint === "search") {
    return searchHelpText();
  }

  if (endpoint === "extract") {
    return extractHelpText();
  }

  return `exa-search ${VERSION}

Usage:
  exa-search search [options] "natural-language query"
  exa-search extract [options] <url...>
  exa-search schema <search|extract>

Commands:
  search                         Search the web with bounded, agent-oriented defaults.
  extract                        Extract focused content from known URLs.
  schema                         Print the JSON Schema for an effective request body.

Defaults:
  Search uses type auto, 5 results, and highlights.
  Extract uses highlights and fails when any requested URL reports an error.
  Freshness controls are omitted so Exa can use its recommended cache-with-crawl-fallback behavior.

Common options:
      --api-key <key>            Defaults to EXA_API_KEY.
      --base-url <url>           Defaults to EXA_BASE_URL or https://api.exa.ai.
      --body <json|@file|@->     Base request JSON. Use @- for stdin; flags override matching fields.
      --format <json|text|urls>  Output format. Default: json.
      --json                     Alias for --format json.
      --compact                  Minify JSON. Default for files and non-interactive stdout.
      --pretty                   Pretty-print JSON. Default in an interactive terminal.
  -o, --output <path>            Atomically write output; refuses to replace an existing file.
      --temp-output              Write to a private temporary file and print only its absolute path.
      --error-format <text|json> Default: text interactively, json otherwise.
      --json-errors              Alias for --error-format json.
      --dry-run                  Validate and print the effective request without authentication or an API call.
      --timeout <ms>             Request timeout. Default: 60000.
  -h, --help                     Show help.
  -V, --version                  Show version.

Exit codes: 0 success, 2 usage, 3 authentication, 4 API, 5 network/timeout,
6 per-URL Extract failure, 7 output file.

Run "exa-search help search" or "exa-search help extract" for command-specific options.
`;
}

export async function apiJson(options: CliRunOptions): Promise<JsonValue> {
  if (options.apiKey === undefined || options.apiKey.trim() === "") {
    throw new CliError("Missing API key. Set EXA_API_KEY or pass --api-key.", {
      kind: "auth",
    });
  }

  const response = await postEndpoint({ ...options, apiKey: options.apiKey }, "application/json");
  try {
    const value: unknown = await response.json();
    if (!isJsonValue(value)) {
      throw new Error("Response was not JSON data");
    }
    return value;
  } catch (error) {
    throw new CliError(`API returned invalid JSON with status ${response.status}`, {
      cause: error,
      kind: "api",
      status: response.status,
    });
  }
}

export async function searchJson(options: CliRunOptions): Promise<JsonValue> {
  if (options.endpoint !== "search") {
    throw new CliError("searchJson requires Search options", { kind: "internal" });
  }
  return apiJson(options);
}

export async function contentsJson(options: CliRunOptions): Promise<JsonValue> {
  if (options.endpoint !== "contents") {
    throw new CliError("contentsJson requires Extract options", { kind: "internal" });
  }
  return apiJson(options);
}

export async function streamSearch(
  options: CliRunOptions,
  write: (chunk: string) => void,
): Promise<void> {
  if (options.endpoint !== "search") {
    throw new CliError("Streaming is only available for Search");
  }
  if (options.apiKey === undefined || options.apiKey.trim() === "") {
    throw new CliError("Missing API key. Set EXA_API_KEY or pass --api-key.", {
      kind: "auth",
    });
  }

  const expectsEventStream = isJsonObject(options.request["outputSchema"]);
  const response = await postEndpoint(
    { ...options, apiKey: options.apiKey },
    expectsEventStream ? "text/event-stream" : "application/json",
  );

  if (!expectsEventStream) {
    let responseBody: JsonValue;
    try {
      const value: unknown = await response.json();
      if (!isJsonValue(value)) {
        throw new Error("Response was not JSON data");
      }
      responseBody = value;
    } catch (error) {
      throw new CliError(`API returned invalid JSON with status ${response.status}`, {
        cause: error,
        kind: "api",
        status: response.status,
      });
    }
    write(formatResponse(responseBody, options.format, options.compact ?? true));
    return;
  }

  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "text/event-stream") {
    throw new CliError(
      `Streaming response must use text/event-stream, received ${mediaType ?? "no content type"}`,
      { kind: "api" },
    );
  }

  if (response.body === null) {
    throw new CliError("Streaming response did not include a body", { kind: "api" });
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  while (true) {
    const read = await reader.read();
    if (read.done) {
      break;
    }
    if (!(read.value instanceof Uint8Array)) {
      throw new CliError("Streaming response contained a non-binary chunk", { kind: "api" });
    }

    buffer += decoder.decode(read.value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      writeSseContent(event, write);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim() !== "") {
    writeSseContent(buffer, write);
  }
}

export type RequestPreview = {
  endpoint: ApiEndpoint;
  method: "POST";
  request: JsonObject;
  timeout_ms: number;
  url: string;
};

export function requestPreview(options: CliRunOptions): RequestPreview {
  return {
    endpoint: options.endpoint,
    method: "POST",
    request: options.request,
    timeout_ms: options.timeoutMs,
    url: apiUrl(options.baseUrl, options.endpoint),
  };
}

export function formatResponse(
  response: JsonValue,
  format: OutputFormat,
  compact: boolean,
): string {
  switch (format) {
    case "json": {
      const json = JSON.stringify(response, null, compact ? 0 : 2);
      return json ?? "undefined";
    }
    case "urls":
      return extractResults(response)
        .map((result) => stringField(result, "url"))
        .filter((url) => url !== undefined)
        .join("\n");
    case "text":
      return formatTextResponse(response);
  }
}

export function errorFormatFromArgv(
  argv: readonly string[],
  defaultFormat: ErrorFormat = "text",
): ErrorFormat {
  let format = defaultFormat;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json-errors") {
      format = "json";
      continue;
    }
    if (value === "--error-format") {
      const next = argv[index + 1];
      if (next === "json" || next === "text") {
        format = next;
      }
      continue;
    }
    if (value?.startsWith("--error-format=")) {
      const inline = value.slice("--error-format=".length);
      if (inline === "json" || inline === "text") {
        format = inline;
      }
    }
  }

  return format;
}

export function formatCliError(error: unknown, format: ErrorFormat): string {
  const cliError =
    error instanceof CliError
      ? error
      : new CliError(error instanceof Error ? error.message : String(error), { kind: "internal" });

  if (format === "text") {
    return cliError.refId === undefined
      ? cliError.message
      : `${cliError.message} (ref_id: ${cliError.refId})`;
  }

  const detail: FormattedCliErrorDetail = {
    kind: cliError.kind,
    message: cliError.message,
  };
  if (cliError.status !== undefined) {
    detail["status"] = cliError.status;
  }
  if (cliError.refId !== undefined) {
    detail["ref_id"] = cliError.refId;
  }
  if (cliError.detail !== undefined && cliError.detail !== null) {
    detail["detail"] = cliError.detail;
  }

  return JSON.stringify({ error: detail, type: "error" });
}

export function contentResponseErrors(response: JsonValue): JsonObject[] {
  return extractStatuses(response).filter((status) => status["status"] === "error");
}

export function hasContentErrors(response: JsonValue): boolean {
  return contentResponseErrors(response).length > 0;
}

function searchHelpText(): string {
  return `exa-search ${VERSION}

Usage:
  exa-search search [options] "natural-language query"
  exa-search search --query "query" [options]
  printf '%s' "long query" | exa-search search --query - --temp-output

Search options:
  -q, --query <text|->               Natural-language query. Positional text is also accepted.
  -t, --type <type>                  auto, fast, instant, deep-lite, deep, or deep-reasoning. Default: auto.
  -n, --num-results <1-100>          Result count. Default: 5 for bounded agent workflows.
      --category <category>          company, publication, news, personal site, financial report, or people.
      --user-location <ISO-2>        Two-letter country code.
      --include-domain <value>       One exact domain, path prefix, or wildcard subdomain. Repeatable.
      --include-domains <json|@file|@->
                                        JSON string array.
      --exclude-domain <value>       One exact domain, path prefix, or wildcard subdomain. Repeatable.
      --exclude-domains <json|@file|@->
                                        JSON string array.
      --start-published-date <value> RFC 3339 lower publication date-time bound.
      --end-published-date <value>   RFC 3339 upper publication date-time bound.
      --moderation                   Enable unsafe-content filtering.
      --no-moderation                Disable unsafe-content filtering.
      --additional-query <query>     Deep-search query variation. Repeatable.
      --additional-queries <json|@file|@->
                                        JSON string array for deep-search variants.
      --system-prompt <prompt>       Guide synthesis or deep-search planning.
      --output-schema <json|@file|@->
                                        Schema for synthesized output.content.
      --stream                       Stream synthesized output when outputSchema is present.
      --no-stream                    Override stream from --body.
      --compliance <hipaa>           Enterprise compliance mode.
      --body <json|@file|@->         Base Search request. Flags override matching fields.

Content options:
      --highlights                   Request token-efficient source excerpts. This is the default.
      --no-highlights                Disable highlights.
      --highlight-query <query>      Guide highlight selection.
      --highlight-max-characters <n> Cap highlights per result at 1-10000 characters.
      --text                         Request page text capped at 10000 characters per result.
      --no-text                      Disable text.
      --text-max-characters <n>      Enable text with a 1-10000 character cap per result.
      --include-html-tags            Preserve lightweight HTML tags in text.
      --text-verbosity <level>       compact, standard, or full.
      --include-section <section>    Include one semantic page section. Repeatable.
      --include-sections <json|@file|@->
                                        JSON string array.
      --exclude-section <section>    Exclude one semantic page section. Repeatable.
      --exclude-sections <json|@file|@->
                                        JSON string array.
      --summary                      Request a per-result LLM summary.
      --no-summary                   Disable summary.
      --summary-query <query>        Guide per-result summaries.
      --summary-schema <json|@file|@->
                                        Schema for structured per-result summaries.

Advanced content options (usually omit):
      --max-age-hours <-1..720>      -1 cache only, 0 always livecrawl, positive values bound cache age.
      --livecrawl-timeout <ms>       Livecrawl timeout, maximum 90000.
      --subpages <0-100>             Crawl linked subpages per result.
      --subpage-target <term>        Prioritize one subpage term. Repeatable.
      --subpage-targets <json|@file|@->
                                        JSON string array.
      --links <0-1000>               Extract links from each page.
      --image-links <0-1000>         Extract image links.
      --rich-image-links <0-1000>    Extract rich image links.
      --rich-links <0-1000>          Extract rich links.
      --code-blocks <0-1000>         Extract code blocks.

Output options:
      --format <json|text|urls>      Default: json.
      --json                         Alias for --format json.
      --compact                      Minify JSON. Automatic outside an interactive terminal.
      --pretty                       Pretty-print JSON. Automatic in an interactive terminal.
  -o, --output <path>                Atomically write output without replacing an existing file.
      --temp-output                  Write to a private temporary file and print only its path.
      --error-format <text|json>     Default: text interactively, json otherwise.
      --json-errors                  Alias for --error-format json.
      --dry-run                      Print the effective request without authentication or an API call.
      --timeout <ms>                 Default: 60000.
      --api-key <key>                Defaults to EXA_API_KEY.
      --base-url <url>               Defaults to EXA_BASE_URL or https://api.exa.ai.

Guidance:
  Start with the defaults. Exa accepts long, semantically rich queries.
  Use fast or instant only for latency-sensitive paths; use deep variants for multi-step research.
  Prefer highlights for agent workflows. Request text only when excerpts are insufficient.
  Leave freshness, category, and domain restrictions unset unless the task requires hard filtering.

Examples:
  exa-search search "current React rendering performance guidance from official documentation" --temp-output
  exa-search search "latest AI regulation policy updates" --category news --num-results 10 --temp-output
  exa-search search "compare frontier AI model releases" --type deep --system-prompt "Prefer official sources" --output-schema @schema.json --temp-output
`;
}

function extractHelpText(): string {
  return `exa-search ${VERSION}

Usage:
  exa-search extract [options] <url...>
  exa-search extract --url https://example.com --highlight-query "pricing changes"
  exa-search extract --urls @urls.json --temp-output

Source options:
      --url <url>                    One exact URL. Repeatable; positional URLs are also accepted.
      --urls <json|@file|@->         JSON string array of URLs.
      --id <document-id>             One Search document ID. Repeatable.
      --ids <json|@file|@->          JSON string array of document IDs.
      --compliance <hipaa>           Enterprise compliance mode.
      --body <json|@file|@->         Base Contents request. Flags override matching fields.

Content options:
      --highlights                   Request token-efficient source excerpts. This is the default.
      --no-highlights                Disable highlights.
      --highlight-query <query>      Guide highlight selection.
      --highlight-max-characters <n> Cap highlights per URL at 1-10000 characters.
      --text                         Request page text capped at 10000 characters per URL.
      --no-text                      Disable text.
      --text-max-characters <n>      Enable text with a 1-10000 character cap per URL.
      --include-html-tags            Preserve lightweight HTML tags in text.
      --text-verbosity <level>       compact, standard, or full.
      --include-section <section>    Include one semantic page section. Repeatable.
      --include-sections <json|@file|@->
                                        JSON string array.
      --exclude-section <section>    Exclude one semantic page section. Repeatable.
      --exclude-sections <json|@file|@->
                                        JSON string array.
      --summary                      Request a per-URL LLM summary.
      --no-summary                   Disable summary.
      --summary-query <query>        Guide summaries.
      --summary-schema <json|@file|@->
                                        Schema for structured per-URL summaries.

Advanced content options (usually omit):
      --max-age-hours <-1..720>      -1 cache only, 0 always livecrawl, positive values bound cache age.
      --livecrawl-timeout <ms>       Livecrawl timeout, maximum 90000.
      --subpages <0-100>             Crawl linked subpages per URL.
      --subpage-target <term>        Prioritize one subpage term. Repeatable.
      --subpage-targets <json|@file|@->
                                        JSON string array.
      --links <0-1000>               Extract links from each page.
      --image-links <0-1000>         Extract image links.
      --rich-image-links <0-1000>    Extract rich image links.
      --rich-links <0-1000>          Extract rich links.
      --code-blocks <0-1000>         Extract code blocks.

Output options:
      --format <json|text|urls>      Default: json.
      --json                         Alias for --format json.
      --compact                      Minify JSON. Automatic outside an interactive terminal.
      --pretty                       Pretty-print JSON. Automatic in an interactive terminal.
  -o, --output <path>                Atomically write output without replacing an existing file.
      --temp-output                  Write to a private temporary file and print only its path.
      --error-format <text|json>     Default: text interactively, json otherwise.
      --json-errors                  Alias for --error-format json.
      --fail-on-errors               Explicitly enforce the default per-URL failure behavior.
      --allow-partial                Exit 0 when Contents reports per-URL errors.
      --dry-run                      Print the effective request without authentication or an API call.
      --timeout <ms>                 Default: 60000.
      --api-key <key>                Defaults to EXA_API_KEY.
      --base-url <url>               Defaults to EXA_BASE_URL or https://api.exa.ai.

Guidance:
  Batch related URLs. Prefer highlights; they are extractive and token efficient.
  Add --highlight-query when the information need is specific.
  Request text only for broader page context and leave freshness unset unless necessary.
  Contents may return HTTP 200 with per-URL failures; this CLI exits 6 by default after preserving the response.

Examples:
  exa-search extract https://exa.ai/docs/reference/search-best-practices --highlight-query "agent defaults" --temp-output
  exa-search extract https://example.com/report.pdf --text --temp-output
  exa-search extract https://example.com/a https://example.com/b --highlight-query "pricing and limits" --temp-output
`;
}

type ReadValue = (allowDash?: boolean) => string;
type StdinReader = (flag: string) => string;

function applyContentOption(
  name: string,
  readValue: ReadValue,
  readStdin: StdinReader,
  state: ParseState,
): boolean {
  switch (name) {
    case "--highlights":
      state.generatedContents["highlights"] = true;
      return true;
    case "--no-highlights":
      state.generatedContents["highlights"] = false;
      return true;
    case "--highlight-query":
      state.generatedContents["highlights"] = mergeObjects(
        getRecord(state.generatedContents["highlights"]),
        { query: readValue() },
      );
      return true;
    case "--highlight-max-characters":
      state.generatedContents["highlights"] = mergeObjects(
        getRecord(state.generatedContents["highlights"]),
        {
          maxCharacters: parseInteger(readValue(), name, {
            min: 1,
            max: 10_000,
          }),
        },
      );
      return true;
    case "--text":
      state.generatedContents["text"] = {
        maxCharacters: DEFAULT_TEXT_MAX_CHARACTERS,
      };
      return true;
    case "--no-text":
      state.generatedContents["text"] = false;
      return true;
    case "--text-max-characters":
      state.generatedContents["text"] = mergeObjects(getRecord(state.generatedContents["text"]), {
        maxCharacters: parseInteger(readValue(), name, {
          min: 1,
          max: 10_000,
        }),
      });
      return true;
    case "--include-html-tags":
      state.generatedContents["text"] = mergeObjects(getRecord(state.generatedContents["text"]), {
        includeHtmlTags: true,
      });
      return true;
    case "--text-verbosity":
      state.generatedContents["text"] = mergeObjects(getRecord(state.generatedContents["text"]), {
        verbosity: parseAllowed(readValue(), name, TEXT_VERBOSITIES),
      });
      return true;
    case "--include-section":
      appendContentArray(state, "text", "includeSections", [
        parseAllowed(readValue(), name, TEXT_SECTIONS),
      ]);
      return true;
    case "--include-sections":
      appendContentArray(
        state,
        "text",
        "includeSections",
        parseJsonStringArray(readValue(), name, readStdin).map((value) =>
          parseAllowed(value, name, TEXT_SECTIONS),
        ),
      );
      return true;
    case "--exclude-section":
      appendContentArray(state, "text", "excludeSections", [
        parseAllowed(readValue(), name, TEXT_SECTIONS),
      ]);
      return true;
    case "--exclude-sections":
      appendContentArray(
        state,
        "text",
        "excludeSections",
        parseJsonStringArray(readValue(), name, readStdin).map((value) =>
          parseAllowed(value, name, TEXT_SECTIONS),
        ),
      );
      return true;
    case "--summary":
      state.generatedContents["summary"] = {};
      return true;
    case "--no-summary":
      state.generatedContents["summary"] = null;
      return true;
    case "--summary-query":
      state.generatedContents["summary"] = mergeObjects(
        getRecord(state.generatedContents["summary"]),
        { query: readValue() },
      );
      return true;
    case "--summary-schema":
      state.generatedContents["summary"] = mergeObjects(
        getRecord(state.generatedContents["summary"]),
        { schema: parseJsonObject(readValue(), name, readStdin) },
      );
      return true;
    case "--livecrawl-timeout":
      state.generatedContents["livecrawlTimeout"] = parseInteger(readValue(), name, {
        min: 1,
        max: 90_000,
      });
      return true;
    case "--max-age-hours":
      state.generatedContents["maxAgeHours"] = parseInteger(readValue(), name, {
        min: -1,
        max: 720,
      });
      return true;
    case "--subpages":
      state.generatedContents["subpages"] = parseInteger(readValue(), name, {
        min: 0,
        max: 100,
      });
      return true;
    case "--subpage-target":
      appendTopLevelArray(state.generatedContents, "subpageTarget", [readValue()]);
      return true;
    case "--subpage-targets":
      appendTopLevelArray(
        state.generatedContents,
        "subpageTarget",
        parseJsonStringArray(readValue(), name, readStdin),
      );
      return true;
    case "--links":
      setExtra(state, "links", parseInteger(readValue(), name, { min: 0, max: 1000 }));
      return true;
    case "--image-links":
      setExtra(state, "imageLinks", parseInteger(readValue(), name, { min: 0, max: 1000 }));
      return true;
    case "--rich-image-links":
      setExtra(state, "richImageLinks", parseInteger(readValue(), name, { min: 0, max: 1000 }));
      return true;
    case "--rich-links":
      setExtra(state, "richLinks", parseInteger(readValue(), name, { min: 0, max: 1000 }));
      return true;
    case "--code-blocks":
      setExtra(state, "codeBlocks", parseInteger(readValue(), name, { min: 0, max: 1000 }));
      return true;
    default:
      return false;
  }
}

function appendContentArray(
  state: ParseState,
  objectField: string,
  arrayField: string,
  values: string[],
): void {
  const object = getRecord(state.generatedContents[objectField]);
  const existing = Array.isArray(object[arrayField]) ? object[arrayField].filter(isString) : [];
  state.generatedContents[objectField] = mergeObjects(object, {
    [arrayField]: uniqueStrings([...existing, ...values]),
  });
}

function appendTopLevelArray(target: JsonObject, field: string, values: string[]): void {
  const existing = Array.isArray(target[field]) ? target[field].filter(isString) : [];
  target[field] = uniqueStrings([...existing, ...values]);
}

function setExtra(state: ParseState, name: string, value: number): void {
  state.generatedContents["extras"] = mergeObjects(getRecord(state.generatedContents["extras"]), {
    [name]: value,
  });
}

function buildCommand(state: ParseState, env: Environment): CliCommand {
  if (state.endpoint === "search") {
    if (state.query !== undefined && state.positional.length > 0) {
      throw new CliError("Use either positional query text or --query, not both");
    }

    if (state.query !== undefined) {
      state.generated["query"] = state.query;
    } else if (state.positional.length > 0) {
      state.generated["query"] = state.positional.join(" ");
    }

    if (state.includeDomains.length > 0) {
      state.generated["includeDomains"] = uniqueStrings(state.includeDomains);
    }
    if (state.excludeDomains.length > 0) {
      state.generated["excludeDomains"] = uniqueStrings(state.excludeDomains);
    }
    if (state.additionalQueries.length > 0) {
      state.generated["additionalQueries"] = uniqueStrings(state.additionalQueries);
    }
    if (Object.keys(state.generatedContents).length > 0) {
      state.generated["contents"] = state.generatedContents;
    }
  } else {
    if (state.positional.length > 0) {
      throw new CliError("Unexpected Extract positional input");
    }
    if (state.urls.length > 0) {
      state.generated["urls"] = uniqueStrings(state.urls);
    }
    if (state.ids.length > 0) {
      state.generated["ids"] = uniqueStrings(state.ids);
    }
    Object.assign(state.generated, state.generatedContents);
  }

  if (state.outputPath !== undefined && state.temporaryOutput) {
    throw new CliError("Use either --output or --temp-output, not both");
  }

  const providedRequest = mergeObjects(state.bodyBase ?? {}, state.generated);
  const request = applyRequestDefaults(state.endpoint, providedRequest);
  validateRequest(state.endpoint, request);

  const stream = state.endpoint === "search" && request["stream"] === true;
  if (stream && (state.outputPath !== undefined || state.temporaryOutput)) {
    throw new CliError("--stream cannot be combined with --output or --temp-output");
  }

  const apiKey = state.apiKey ?? env["EXA_API_KEY"];
  if (!state.dryRun && (apiKey === undefined || apiKey.trim() === "")) {
    throw new CliError("Missing API key. Set EXA_API_KEY or pass --api-key.", {
      kind: "auth",
    });
  }

  const baseUrl = state.baseUrl ?? env["EXA_BASE_URL"] ?? "https://api.exa.ai";
  const apiEndpoint = state.endpoint === "search" ? "search" : "contents";
  try {
    apiUrl(baseUrl, apiEndpoint);
  } catch (error) {
    throw new CliError("--base-url must be a valid URL", { cause: error });
  }

  return {
    endpoint: state.endpoint,
    kind: "run",
    options: {
      apiKey,
      baseUrl,
      compact: state.compact,
      dryRun: state.dryRun,
      endpoint: apiEndpoint,
      failOnErrors: state.failOnErrors,
      format: state.format,
      outputPath: state.outputPath,
      request,
      stream,
      temporaryOutput: state.temporaryOutput,
      timeoutMs: state.timeoutMs,
    },
  };
}

function applyRequestDefaults(endpoint: CliEndpoint, request: JsonObject): JsonObject {
  if (endpoint === "search") {
    const withDefaults = mergeObjects(
      {
        numResults: DEFAULT_NUM_RESULTS,
        type: "auto",
      },
      request,
    );
    const contents = withDefaults["contents"];
    if (contents === null || (contents !== undefined && !isJsonObject(contents))) {
      return withDefaults;
    }

    const contentOptions = getRecord(contents);
    if (hasContentSelection(contentOptions)) {
      return withDefaults;
    }

    return mergeObjects(withDefaults, {
      contents: { highlights: true },
    });
  }

  if (hasContentSelection(request)) {
    return request;
  }

  return mergeObjects(request, { highlights: true });
}

function hasContentSelection(value: JsonObject): boolean {
  return ["context", "highlights", "summary", "text"].some((field) => Object.hasOwn(value, field));
}

function validateRequest(endpoint: CliEndpoint, request: JsonObject): void {
  if (endpoint === "search") {
    validateSearchRequest(request);
  } else {
    validateContentsRequest(request);
  }
}

function validateSearchRequest(request: JsonObject): void {
  assertStringValue(request["query"], "query");

  rejectDeprecatedField(request, "startCrawlDate", "Remove startCrawlDate; it has no effect");
  rejectDeprecatedField(request, "endCrawlDate", "Remove endCrawlDate; it has no effect");
  rejectDeprecatedField(request, "context", "Use contents.highlights or contents.text instead");

  if (isPresent(request["type"])) {
    assertAllowedValue(request["type"], "type", SEARCH_TYPES);
  }

  if (isPresent(request["numResults"])) {
    assertIntegerValue(request["numResults"], "numResults", { min: 1, max: 100 });
  }

  if (isPresent(request["category"])) {
    assertAllowedValue(request["category"], "category", CATEGORIES);
  }

  if (isPresent(request["userLocation"])) {
    if (!isString(request["userLocation"]) || !/^[A-Za-z]{2}$/.test(request["userLocation"])) {
      throw new CliError("userLocation must be a two-letter ISO country code or null");
    }
  }

  if (isPresent(request["moderation"]) && !isBoolean(request["moderation"])) {
    throw new CliError("moderation must be a boolean or null");
  }

  if (isPresent(request["startPublishedDate"])) {
    assertDateTimeValue(request["startPublishedDate"], "startPublishedDate");
  }
  if (isPresent(request["endPublishedDate"])) {
    assertDateTimeValue(request["endPublishedDate"], "endPublishedDate");
  }

  if (isPresent(request["compliance"])) {
    assertAllowedValue(request["compliance"], "compliance", COMPLIANCE_MODES);
  }

  if (isPresent(request["systemPrompt"])) {
    assertStringValue(request["systemPrompt"], "systemPrompt");
  }

  if (isPresent(request["stream"]) && !isBoolean(request["stream"])) {
    throw new CliError("stream must be a boolean or null");
  }

  validateOutputSchema(request["outputSchema"]);
  validateStringArray(request["includeDomains"], "includeDomains", {
    maxItems: 1200,
    minItemLength: 1,
  });
  validateStringArray(request["excludeDomains"], "excludeDomains", {
    maxItems: 1200,
    minItemLength: 1,
  });
  validateStringArray(request["additionalQueries"], "additionalQueries", {
    minItems: 1,
    maxItems: 10,
    minItemLength: 1,
  });

  if (Array.isArray(request["additionalQueries"]) && request["additionalQueries"].length > 0) {
    const type = request["type"];
    if (!isString(type) || !DEEP_SEARCH_TYPES.some((candidate) => candidate === type)) {
      throw new CliError("additionalQueries is only available for deep search types");
    }
  }

  if (request["category"] === "company" || request["category"] === "people") {
    const forbidden = ["excludeDomains", "startPublishedDate", "endPublishedDate"].filter((field) =>
      isPresent(request[field]),
    );
    if (forbidden.length > 0) {
      throw new CliError(
        `${request["category"]} category does not support: ${forbidden.join(", ")}`,
      );
    }
  }

  if (request["contents"] !== undefined) {
    validateContentsOptions(request["contents"], "contents");
  }
}

function validateContentsRequest(request: JsonObject): void {
  const hasIds = isPresent(request["ids"]);
  const hasUrls = isPresent(request["urls"]);
  if (hasIds === hasUrls) {
    throw new CliError("Provide exactly one of ids or urls");
  }

  const sourceField = hasIds ? "ids" : "urls";
  validateStringArray(request[sourceField], sourceField, {
    minItems: 1,
    maxItems: 100,
    minItemLength: 1,
    maxItemLength: 2048,
  });

  if (isPresent(request["compliance"])) {
    assertAllowedValue(request["compliance"], "compliance", COMPLIANCE_MODES);
  }

  validateContentsOptions(request, "");
}

function validateContentsOptions(value: unknown, prefix: string): void {
  if (value === null) {
    return;
  }
  if (!isJsonObject(value)) {
    throw new CliError(`${prefix || "Contents request"} must be an object or null`);
  }

  rejectDeprecatedField(value, "context", "Use highlights or text instead", prefix);
  rejectDeprecatedField(value, "livecrawl", "Use maxAgeHours instead", prefix);

  const highlightsField = nestedField(prefix, "highlights");
  const textField = nestedField(prefix, "text");
  const summaryField = nestedField(prefix, "summary");
  validateBooleanOrObject(value["highlights"], highlightsField);
  validateBooleanOrObject(value["text"], textField);
  validateObjectOrNull(value["summary"], summaryField);
  validateTextOptions(value["text"], textField);
  validateHighlightOptions(value["highlights"], highlightsField);
  validateSummaryOptions(value["summary"], summaryField);

  const livecrawlTimeoutField = nestedField(prefix, "livecrawlTimeout");
  if (isPresent(value["livecrawlTimeout"])) {
    assertIntegerValue(value["livecrawlTimeout"], livecrawlTimeoutField, {
      min: 1,
      max: 90_000,
    });
  }

  const maxAgeHoursField = nestedField(prefix, "maxAgeHours");
  if (isPresent(value["maxAgeHours"])) {
    assertIntegerValue(value["maxAgeHours"], maxAgeHoursField, { min: -1, max: 720 });
  }

  const subpagesField = nestedField(prefix, "subpages");
  if (isPresent(value["subpages"])) {
    assertIntegerValue(value["subpages"], subpagesField, { min: 0, max: 100 });
  }

  validateSubpageTarget(value["subpageTarget"], nestedField(prefix, "subpageTarget"));
  validateExtras(value["extras"], nestedField(prefix, "extras"));
}

function validateTextOptions(value: unknown, field: string): void {
  if (!isJsonObject(value)) {
    return;
  }

  if (isPresent(value["maxCharacters"])) {
    assertIntegerValue(value["maxCharacters"], `${field}.maxCharacters`, {
      min: 1,
      max: 10_000,
    });
  }

  if (isPresent(value["includeHtmlTags"]) && !isBoolean(value["includeHtmlTags"])) {
    throw new CliError(`${field}.includeHtmlTags must be a boolean or null`);
  }

  if (isPresent(value["verbosity"])) {
    assertAllowedValue(value["verbosity"], `${field}.verbosity`, TEXT_VERBOSITIES);
  }

  validateStringArray(value["includeSections"], `${field}.includeSections`, {
    allowed: TEXT_SECTIONS,
  });
  validateStringArray(value["excludeSections"], `${field}.excludeSections`, {
    allowed: TEXT_SECTIONS,
  });
}

function validateHighlightOptions(value: unknown, field: string): void {
  if (!isJsonObject(value)) {
    return;
  }

  rejectDeprecatedField(
    value,
    "numSentences",
    `Use ${field}: true or ${field}.maxCharacters instead`,
  );
  rejectDeprecatedField(
    value,
    "highlightsPerUrl",
    `Use ${field}: true or ${field}.maxCharacters instead`,
  );

  if (isPresent(value["query"])) {
    assertStringValue(value["query"], `${field}.query`);
  }

  if (isPresent(value["maxCharacters"])) {
    assertIntegerValue(value["maxCharacters"], `${field}.maxCharacters`, {
      min: 1,
      max: 10_000,
    });
  }
}

function validateSummaryOptions(value: unknown, field: string): void {
  if (!isJsonObject(value)) {
    return;
  }

  if (isPresent(value["query"])) {
    assertStringValue(value["query"], `${field}.query`);
  }

  if (isPresent(value["schema"]) && !isJsonObject(value["schema"])) {
    throw new CliError(`${field}.schema must be an object or null`);
  }
}

function validateSubpageTarget(value: unknown, field: string): void {
  if (!isPresent(value)) {
    return;
  }

  if (isString(value)) {
    if (value.length < 1 || value.length > 100) {
      throw new CliError(`${field} must contain between 1 and 100 characters`);
    }
    return;
  }

  validateStringArray(value, field, {
    maxItems: 100,
    minItemLength: 1,
    maxItemLength: 100,
  });
}

function validateExtras(value: unknown, field: string): void {
  if (!isPresent(value)) {
    return;
  }
  if (!isJsonObject(value)) {
    throw new CliError(`${field} must be an object or null`);
  }

  for (const option of ["links", "imageLinks", "richImageLinks", "richLinks", "codeBlocks"]) {
    if (isPresent(value[option])) {
      assertIntegerValue(value[option], `${field}.${option}`, { min: 0, max: 1000 });
    }
  }
}

function validateOutputSchema(value: unknown): void {
  if (!isPresent(value)) {
    return;
  }
  if (!isJsonObject(value)) {
    throw new CliError("outputSchema must be an object or null");
  }

  const type = value["type"];
  if (type !== "text" && type !== "object") {
    throw new CliError('outputSchema.type must be "text" or "object"');
  }

  if (value["description"] !== undefined && !isString(value["description"])) {
    throw new CliError("outputSchema.description must be a string");
  }

  if (type === "object") {
    if (value["properties"] !== undefined && !isJsonObject(value["properties"])) {
      throw new CliError("outputSchema.properties must be an object");
    }
    if (value["required"] === null) {
      throw new CliError("outputSchema.required must be an array of strings");
    }
    validateStringArray(value["required"], "outputSchema.required");
    if (value["additionalProperties"] !== undefined && !isBoolean(value["additionalProperties"])) {
      throw new CliError("outputSchema.additionalProperties must be a boolean");
    }
  }
}

function rejectDeprecatedField(
  value: JsonObject,
  field: string,
  replacement: string,
  prefix = "",
): void {
  if (!Object.hasOwn(value, field)) {
    return;
  }

  throw new CliError(`${nestedField(prefix, field)} is deprecated. ${replacement}.`);
}

async function postEndpoint(
  options: CliRunOptions & { apiKey: string },
  accept: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(apiUrl(options.baseUrl, options.endpoint), {
      body: JSON.stringify(options.request),
      headers: {
        accept,
        "content-type": "application/json",
        "x-api-key": options.apiKey,
      },
      method: "POST",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new CliError(`Request timed out after ${options.timeoutMs} ms`, {
        cause: error,
        kind: "timeout",
      });
    }

    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`Network request failed: ${reason}`, {
      cause: error,
      kind: "network",
    });
  }

  if (!response.ok) {
    throw await buildHttpError(response);
  }

  return response;
}

async function buildHttpError(response: Response): Promise<CliError> {
  const text = (await response.text()).trim();
  const statusLabel = `${response.status} ${response.statusText}`.trim();
  let detail: JsonValue | undefined;
  let message = statusLabel;
  let refId: string | undefined;

  if (text !== "") {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isJsonValue(parsed)) {
        throw new Error("Response was not JSON data");
      }
      detail = parsed;
      if (isJsonObject(parsed)) {
        const nestedError = parsed["error"];
        if (isString(nestedError)) {
          message = `${statusLabel}: ${nestedError}`;
        } else if (isJsonObject(nestedError)) {
          const nestedMessage = stringField(nestedError, "message");
          if (nestedMessage !== undefined) {
            message = `${statusLabel}: ${nestedMessage}`;
          }
          refId =
            stringField(nestedError, "ref_id") ??
            stringField(nestedError, "requestId") ??
            stringField(nestedError, "request_id");
          detail = nestedError["detail"] ?? nestedError;
        } else {
          const topLevelMessage = stringField(parsed, "message");
          if (topLevelMessage !== undefined) {
            message = `${statusLabel}: ${topLevelMessage}`;
          } else if (Array.isArray(parsed["errors"])) {
            message = `${statusLabel}: ${parsed["errors"]
              .map((entry) => formatContentValue(entry))
              .join("\n")}`;
            detail = parsed["errors"];
          }
          refId =
            stringField(parsed, "ref_id") ??
            stringField(parsed, "requestId") ??
            stringField(parsed, "request_id");
        }
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      message = `${statusLabel}: ${text}`;
      detail = text;
    }
  }

  const options: CliErrorOptions = {
    kind: response.status === 401 ? "auth" : "api",
    status: response.status,
  };
  if (detail !== undefined) {
    options.detail = detail;
  }
  if (refId !== undefined) {
    options.refId = refId;
  }
  return new CliError(message, options);
}

function writeSseContent(event: string, write: (chunk: string) => void): void {
  const data = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");

  if (data === "" || data === "[DONE]") {
    return;
  }

  let parsed: JsonValue;
  try {
    const value: unknown = JSON.parse(data);
    if (!isJsonValue(value)) {
      throw new Error("Stream event was not JSON data");
    }
    parsed = value;
  } catch (error) {
    throw new CliError("Search stream contained invalid JSON data", {
      cause: error,
      kind: "api",
    });
  }

  if (!isJsonObject(parsed)) {
    throw new CliError("Search stream event must be an object", { kind: "api" });
  }

  const type = parsed["type"];
  if (type === undefined) {
    const content = streamChoiceContent(parsed);
    if (content !== undefined) {
      write(content);
      return;
    }
    throw new CliError("Search stream event must include a type", { kind: "api" });
  }
  if (!isString(type)) {
    throw new CliError("Search stream event type must be a string", { kind: "api" });
  }

  switch (type) {
    case "text-delta": {
      const delta = isString(parsed["delta"]) ? parsed["delta"] : streamChoiceContent(parsed);
      if (delta === undefined) {
        throw new CliError("Search text-delta event must include text", { kind: "api" });
      }
      write(delta);
      return;
    }
    case "error":
      if (!isJsonObject(parsed["error"]) || !isString(parsed["error"]["message"])) {
        throw new CliError("Search error event must include an error message", { kind: "api" });
      }
      throw new CliError(`Search stream error: ${parsed["error"]["message"]}`, { kind: "api" });
    case "grounding":
    case "results":
    case "stream-reset":
    case "done":
      return;
    default:
      throw new CliError(`Unknown search stream event type: ${type}`, { kind: "api" });
  }
}

function streamChoiceContent(event: JsonObject): string | undefined {
  if (!Array.isArray(event["choices"])) {
    return undefined;
  }

  for (const choice of event["choices"]) {
    if (!isJsonObject(choice) || !isJsonObject(choice["delta"])) {
      continue;
    }
    const content = choice["delta"]["content"];
    if (isString(content)) {
      return content;
    }
  }

  return undefined;
}

function formatTextResponse(response: JsonValue): string {
  const lines: string[] = [];

  if (
    isJsonObject(response) &&
    isJsonObject(response["output"]) &&
    response["output"]["content"] !== undefined
  ) {
    lines.push(formatContentValue(response["output"]["content"]));
    lines.push("");
    appendGrounding(response["output"], lines);
  }

  const results = extractResults(response);
  results.forEach((result, index) => {
    const title = stringField(result, "title") ?? "Untitled";
    const url = stringField(result, "url") ?? "";
    lines.push(`${index + 1}. ${title}`);
    if (url !== "") {
      lines.push(`   ${url}`);
    }

    const publishedDate = stringField(result, "publishedDate");
    const author = stringField(result, "author");
    const metadata = [publishedDate, author].filter((value) => value !== undefined);
    if (metadata.length > 0) {
      lines.push(`   ${metadata.join(" · ")}`);
    }

    const summary = result["summary"];
    if (summary !== undefined && summary !== null) {
      lines.push(indentBlock(formatContentValue(summary), "   Summary: ", "            "));
    }

    if (Array.isArray(result["highlights"]) && result["highlights"].length > 0) {
      lines.push("   Highlights:");
      for (const highlight of result["highlights"]) {
        if (isString(highlight)) {
          lines.push(indentBlock(highlight, "   - ", "     "));
        }
      }
    }

    const text = stringField(result, "text");
    if (text !== undefined) {
      lines.push(indentBlock(text, "   Text: ", "         "));
    }

    lines.push("");
  });

  const statuses = extractStatuses(response);
  if (statuses.length > 0) {
    lines.push("Statuses:");
    for (const status of statuses) {
      const id = stringField(status, "id") ?? "Unknown source";
      const state = stringField(status, "status") ?? "unknown";
      const source = stringField(status, "source");
      let line = `- ${state}: ${id}`;
      if (source !== undefined) {
        line += ` (${source})`;
      }
      if (isJsonObject(status["error"])) {
        const tag = stringField(status["error"], "tag");
        const httpStatusCode = status["error"]["httpStatusCode"];
        const details = [tag, isNumber(httpStatusCode) ? `HTTP ${httpStatusCode}` : undefined]
          .filter((value) => value !== undefined)
          .join(", ");
        if (details !== "") {
          line += ` — ${details}`;
        }
      }
      lines.push(line);
    }
    lines.push("");
  }

  if (isJsonObject(response)) {
    const requestId = stringField(response, "requestId");
    if (requestId !== undefined) {
      lines.push(`requestId: ${requestId}`);
    }

    if (isJsonObject(response["costDollars"]) && isNumber(response["costDollars"]["total"])) {
      lines.push(`costDollars.total: ${response["costDollars"]["total"]}`);
    }
  }

  return trimTrailingBlankLines(lines).join("\n");
}

function appendGrounding(output: JsonObject, lines: string[]): void {
  if (!Array.isArray(output["grounding"]) || output["grounding"].length === 0) {
    return;
  }

  lines.push("Grounding:");
  for (const entry of output["grounding"]) {
    if (!isJsonObject(entry)) {
      continue;
    }
    const field = stringField(entry, "field") ?? "content";
    const confidence = stringField(entry, "confidence");
    lines.push(`- ${field}${confidence === undefined ? "" : ` (${confidence})`}`);
    if (!Array.isArray(entry["citations"])) {
      continue;
    }
    for (const citation of entry["citations"]) {
      if (!isJsonObject(citation)) {
        continue;
      }
      const url = stringField(citation, "url");
      const title = stringField(citation, "title");
      if (url !== undefined) {
        lines.push(`  - ${title === undefined ? url : `${title} — ${url}`}`);
      }
    }
  }
  lines.push("");
}

function extractResults(response: JsonValue): JsonObject[] {
  if (!isJsonObject(response) || !Array.isArray(response["results"])) {
    return [];
  }

  return response["results"].filter(isJsonObject);
}

function extractStatuses(response: JsonValue): JsonObject[] {
  if (!isJsonObject(response) || !Array.isArray(response["statuses"])) {
    return [];
  }

  return response["statuses"].filter(isJsonObject);
}

function formatContentValue(value: JsonValue): string {
  if (isString(value)) {
    return value;
  }

  return JSON.stringify(value, null, 2) ?? "undefined";
}

function indentBlock(value: string, firstPrefix: string, nextPrefix: string): string {
  return value
    .split(/\r?\n/)
    .map((line, index) => `${index === 0 ? firstPrefix : nextPrefix}${line}`)
    .join("\n");
}

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") {
    end -= 1;
  }

  return lines.slice(0, end);
}

type SplitFlag = {
  name: string;
  inlineValue?: string;
};

function splitFlag(value: string): SplitFlag {
  if (!value.startsWith("--")) {
    return { name: value };
  }

  const equalsIndex = value.indexOf("=");
  if (equalsIndex === -1) {
    return { name: value };
  }

  return {
    inlineValue: value.slice(equalsIndex + 1),
    name: value.slice(0, equalsIndex),
  };
}

function ensureEndpoint(actual: CliEndpoint, expected: CliEndpoint, flag: string): void {
  if (actual !== expected) {
    throw new CliError(`${flag} is only available for the ${expected} command`);
  }
}

function parseJsonObject(value: string, flag: string, readStdin: StdinReader): JsonObject {
  const parsed = parseJsonOrFile(value, flag, readStdin);
  if (!isJsonObject(parsed)) {
    throw new CliError(`${flag} must be a JSON object`);
  }

  return parsed;
}

function parseJsonStringArray(value: string, flag: string, readStdin: StdinReader): string[] {
  const parsed = parseJsonOrFile(value, flag, readStdin);
  validateStringArray(parsed, flag, { minItemLength: 1 });
  return parsed ?? [];
}

function parseJsonOrFile(value: string, flag: string, readStdin: StdinReader): JsonValue {
  const source = value.startsWith("@") ? readJsonFile(value.slice(1), flag, readStdin) : value;

  try {
    const parsed: unknown = JSON.parse(source);
    if (!isJsonValue(parsed)) {
      throw new Error("Input was not JSON data");
    }
    return parsed;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`${flag} contains invalid JSON: ${reason}`);
  }
}

function readJsonFile(path: string, flag: string, readStdin: StdinReader): string {
  if (path === "-") {
    return readStdin(flag);
  }

  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`Could not read ${flag} file ${path}: ${reason}`);
  }
}

function parseDateTime(value: string, flag: string): string {
  assertDateTimeValue(value, flag);
  return value;
}

function parseInteger(value: string, flag: string, bounds: { min?: number; max?: number }): number {
  if (!/^-?\d+$/.test(value)) {
    throw new CliError(`${flag} must be an integer`);
  }

  const parsed = Number(value);
  assertIntegerValue(parsed, flag, bounds);
  return parsed;
}

function assertIntegerValue(
  value: unknown,
  field: string,
  bounds: { min?: number; max?: number },
): void {
  if (!isNumber(value) || !Number.isInteger(value)) {
    throw new CliError(`${field} must be an integer`);
  }

  if (bounds.min !== undefined && value < bounds.min) {
    throw new CliError(`${field} must be >= ${bounds.min}`);
  }
  if (bounds.max !== undefined && value > bounds.max) {
    throw new CliError(`${field} must be <= ${bounds.max}`);
  }
}

function assertDateTimeValue(value: unknown, field: string): void {
  if (!isString(value)) {
    throw new CliError(`${field} must be an RFC 3339 date-time string`);
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (match === null) {
    throw new CliError(`${field} must be an RFC 3339 date-time string`);
  }

  const [
    ,
    yearValue,
    monthValue,
    dayValue,
    hourValue,
    minuteValue,
    secondValue,
    offsetHourValue,
    offsetMinuteValue,
  ] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = Number(secondValue);
  const offsetHour = offsetHourValue === undefined ? 0 : Number(offsetHourValue);
  const offsetMinute = offsetMinuteValue === undefined ? 0 : Number(offsetMinuteValue);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    daysInMonth === undefined ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new CliError(`${field} must be an RFC 3339 date-time string`);
  }
}

function parseAllowed<const Values extends readonly string[]>(
  value: string,
  flag: string,
  allowed: Values,
): Values[number] {
  for (const candidate of allowed) {
    if (candidate === value) {
      return candidate;
    }
  }
  throw new CliError(`${flag} must be one of: ${allowed.join(", ")}`);
}

function assertAllowedValue(value: unknown, field: string, allowed: readonly string[]): void {
  if (!isString(value) || !allowed.includes(value)) {
    throw new CliError(`${field} must be one of: ${allowed.join(", ")}`);
  }
}

function parseUserLocation(value: string, flag: string): string {
  if (!/^[A-Za-z]{2}$/.test(value)) {
    throw new CliError(`${flag} must be a two-letter ISO country code`);
  }

  return value.toUpperCase();
}

function assertStringValue(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CliError(`${field} must be a non-empty string`);
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function validateStringArray(
  value: unknown,
  field: string,
  bounds: {
    minItems?: number;
    maxItems?: number;
    minItemLength?: number;
    maxItemLength?: number;
    allowed?: readonly string[];
  } = {},
): asserts value is string[] | null | undefined {
  if (!isPresent(value)) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new CliError(`${field} must be an array of strings or null`);
  }

  const strings: string[] = [];
  for (const entry of value) {
    if (!isString(entry)) {
      throw new CliError(`${field} must be an array of strings or null`);
    }
    strings.push(entry);
  }

  if (bounds.minItems !== undefined && strings.length < bounds.minItems) {
    throw new CliError(`${field} must contain at least ${bounds.minItems} entries`);
  }
  if (bounds.maxItems !== undefined && strings.length > bounds.maxItems) {
    throw new CliError(`${field} must contain at most ${bounds.maxItems} entries`);
  }

  for (const entry of strings) {
    if (bounds.minItemLength !== undefined && entry.length < bounds.minItemLength) {
      throw new CliError(
        `${field} entries must contain at least ${bounds.minItemLength} characters`,
      );
    }
    if (bounds.maxItemLength !== undefined && entry.length > bounds.maxItemLength) {
      throw new CliError(
        `${field} entries must contain at most ${bounds.maxItemLength} characters`,
      );
    }
    if (bounds.allowed !== undefined && !bounds.allowed.includes(entry)) {
      throw new CliError(`${field} entries must be one of: ${bounds.allowed.join(", ")}`);
    }
  }
}

function validateBooleanOrObject(value: unknown, field: string): void {
  if (!isPresent(value) || isBoolean(value) || isJsonObject(value)) {
    return;
  }

  throw new CliError(`${field} must be a boolean, object, or null`);
}

function validateObjectOrNull(value: unknown, field: string): void {
  if (!isPresent(value) || isJsonObject(value)) {
    return;
  }

  throw new CliError(`${field} must be an object or null`);
}

function nestedField(prefix: string, field: string): string {
  return prefix === "" ? field : `${prefix}.${field}`;
}

function mergeObjects(base: JsonObject, override: JsonObject) {
  const merged: JsonObject = {};
  Object.assign(merged, base);

  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];
    if (isJsonObject(baseValue) && isJsonObject(value)) {
      merged[key] = mergeObjects(baseValue, value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

function getRecord(value: JsonValue | undefined) {
  return isJsonObject(value) ? value : {};
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || isBoolean(value) || isNumber(value) || isString(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return typeof value === "object" && Object.values(value).every(isJsonValue);
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && isJsonValue(value) && value !== null && !Array.isArray(value);
}

function readPackageVersion(): string {
  const packageJson: unknown = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  if (!isJsonObject(packageJson) || !isString(packageJson["version"])) {
    throw new Error("package.json must include a string version");
  }

  return packageJson["version"];
}

function stringField(record: JsonObject, field: string): string | undefined {
  const value = record[field];
  return isString(value) && value !== "" ? value : undefined;
}

function apiUrl(baseUrl: string, endpoint: ApiEndpoint): string {
  const trimmed = baseUrl.trim();
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  if (withoutTrailingSlash.endsWith(`/${endpoint}`)) {
    return withoutTrailingSlash;
  }

  return new URL(endpoint, trimmed.endsWith("/") ? trimmed : `${trimmed}/`).toString();
}
