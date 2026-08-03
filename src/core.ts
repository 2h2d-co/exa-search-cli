import { readFileSync } from "node:fs";

export const VERSION = readPackageVersion();

const SEARCH_TYPES = ["auto", "fast", "instant", "deep-lite", "deep", "deep-reasoning"];
const CATEGORIES = [
  "company",
  "publication",
  "news",
  "personal site",
  "financial report",
  "people",
];
const COMPLIANCE_MODES = ["hipaa"];
const TEXT_VERBOSITIES = ["compact", "standard", "full"];
const TEXT_SECTIONS = ["header", "navigation", "banner", "body", "sidebar", "footer", "metadata"];
const OUTPUT_FORMATS = ["json", "text", "urls"];

export type OutputFormat = "json" | "text" | "urls";

export type CliCommand =
  | { kind: "help" }
  | { kind: "version" }
  | {
      kind: "run";
      options: CliRunOptions;
    };

export type CliRunOptions = {
  apiKey: string;
  baseUrl: string;
  compact: boolean;
  format: OutputFormat;
  request: Record<string, unknown>;
  stream: boolean;
  timeoutMs: number;
};

type Environment = Record<string, string | undefined>;

type ParseState = {
  additionalQueries: string[];
  apiKey?: string;
  baseUrl?: string;
  bodyBase?: Record<string, unknown>;
  compact: boolean;
  contentModeExplicit: boolean;
  excludeDomains: string[];
  excludeSections: string[];
  format: OutputFormat;
  generated: Record<string, unknown>;
  generatedContents: Record<string, unknown>;
  highlightMaxCharacters?: number;
  highlightPreference: "auto" | "enabled" | "disabled";
  highlightQuery?: string;
  includeDomains: string[];
  includeSections: string[];
  positionalQuery: string[];
  query?: string;
  subpageTargets: string[];
  summaryEnabled: boolean;
  summaryOptions: Record<string, unknown>;
  textEnabled: boolean;
  textOptions: Record<string, unknown>;
  timeoutMs: number;
};

export class CliError extends Error {
  exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function parseCli(argv: readonly string[], env: Environment = process.env): CliCommand {
  const state: ParseState = {
    additionalQueries: [],
    compact: false,
    contentModeExplicit: false,
    excludeDomains: [],
    excludeSections: [],
    format: "json",
    generated: {},
    generatedContents: {},
    highlightPreference: "auto",
    includeDomains: [],
    includeSections: [],
    positionalQuery: [],
    subpageTargets: [],
    summaryEnabled: false,
    summaryOptions: {},
    textEnabled: false,
    textOptions: {},
    timeoutMs: 60_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === undefined) {
      continue;
    }

    if (current === "--") {
      state.positionalQuery.push(...argv.slice(index + 1));
      break;
    }

    if (!current.startsWith("-") || current === "-") {
      state.positionalQuery.push(current);
      continue;
    }

    const flag = splitFlag(current);
    const readValue = (): string => {
      if (flag.inlineValue !== undefined) {
        return flag.inlineValue;
      }

      index += 1;
      const value = argv[index];
      if (value === undefined) {
        throw new CliError(`${flag.name} requires a value`);
      }

      return value;
    };

    switch (flag.name) {
      case "-h":
      case "--help":
        return { kind: "help" };
      case "-V":
      case "--version":
        return { kind: "version" };
      case "--api-key":
        state.apiKey = readValue();
        break;
      case "--base-url":
        state.baseUrl = readValue();
        break;
      case "-q":
      case "--query":
        state.query = readValue();
        break;
      case "-n":
      case "--num-results":
        state.generated["numResults"] = parseInteger(readValue(), flag.name, { min: 1, max: 100 });
        break;
      case "-t":
      case "--type":
        state.generated["type"] = parseAllowed(readValue(), flag.name, SEARCH_TYPES);
        break;
      case "--category":
        state.generated["category"] = parseAllowed(readValue(), flag.name, CATEGORIES);
        break;
      case "--user-location":
        state.generated["userLocation"] = parseUserLocation(readValue(), flag.name);
        break;
      case "--include-domain":
      case "--include-domains":
        state.includeDomains.push(...parseList(readValue()));
        break;
      case "--exclude-domain":
      case "--exclude-domains":
        state.excludeDomains.push(...parseList(readValue()));
        break;
      case "--start-published-date":
        state.generated["startPublishedDate"] = parseDateTime(readValue(), flag.name);
        break;
      case "--end-published-date":
        state.generated["endPublishedDate"] = parseDateTime(readValue(), flag.name);
        break;
      case "--moderation":
        state.generated["moderation"] = true;
        break;
      case "--no-moderation":
        state.generated["moderation"] = false;
        break;
      case "--additional-query":
      case "--additional-queries":
        state.additionalQueries.push(readValue());
        break;
      case "--system-prompt":
        state.generated["systemPrompt"] = readValue();
        break;
      case "--output-schema":
        state.generated["outputSchema"] = parseJsonOrFile(readValue(), flag.name);
        break;
      case "--compliance":
        state.generated["compliance"] = parseAllowed(readValue(), flag.name, COMPLIANCE_MODES);
        break;
      case "--stream":
        state.generated["stream"] = true;
        break;
      case "--body":
        state.bodyBase = parseJsonObject(readValue(), flag.name);
        break;
      case "--highlights":
        state.contentModeExplicit = true;
        state.highlightPreference = "enabled";
        break;
      case "--no-highlights":
        state.contentModeExplicit = true;
        state.highlightPreference = "disabled";
        break;
      case "--highlight-query":
        state.contentModeExplicit = true;
        state.highlightPreference = "enabled";
        state.highlightQuery = readValue();
        break;
      case "--highlight-max-characters":
        state.contentModeExplicit = true;
        state.highlightPreference = "enabled";
        state.highlightMaxCharacters = parseInteger(readValue(), flag.name, {
          min: 1,
          max: 10_000,
        });
        break;
      case "--text":
        state.contentModeExplicit = true;
        state.textEnabled = true;
        break;
      case "--text-max-characters":
        state.contentModeExplicit = true;
        state.textEnabled = true;
        state.textOptions["maxCharacters"] = parseInteger(readValue(), flag.name, {
          min: 1,
          max: 10_000,
        });
        break;
      case "--include-html-tags":
        state.contentModeExplicit = true;
        state.textEnabled = true;
        state.textOptions["includeHtmlTags"] = true;
        break;
      case "--text-verbosity":
        state.contentModeExplicit = true;
        state.textEnabled = true;
        state.textOptions["verbosity"] = parseAllowed(readValue(), flag.name, TEXT_VERBOSITIES);
        break;
      case "--include-section":
      case "--include-sections":
        state.contentModeExplicit = true;
        state.textEnabled = true;
        state.includeSections.push(...parseAllowedList(readValue(), flag.name, TEXT_SECTIONS));
        break;
      case "--exclude-section":
      case "--exclude-sections":
        state.contentModeExplicit = true;
        state.textEnabled = true;
        state.excludeSections.push(...parseAllowedList(readValue(), flag.name, TEXT_SECTIONS));
        break;
      case "--summary":
        state.contentModeExplicit = true;
        state.summaryEnabled = true;
        break;
      case "--summary-query":
        state.contentModeExplicit = true;
        state.summaryEnabled = true;
        state.summaryOptions["query"] = readValue();
        break;
      case "--summary-schema":
        state.contentModeExplicit = true;
        state.summaryEnabled = true;
        state.summaryOptions["schema"] = parseJsonOrFile(readValue(), flag.name);
        break;
      case "--livecrawl-timeout":
        state.generatedContents["livecrawlTimeout"] = parseInteger(readValue(), flag.name, {
          min: 1,
          max: 90_000,
        });
        break;
      case "--max-age-hours":
        state.generatedContents["maxAgeHours"] = parseInteger(readValue(), flag.name, {
          min: -1,
          max: 720,
        });
        break;
      case "--subpages":
        state.generatedContents["subpages"] = parseInteger(readValue(), flag.name, {
          min: 0,
          max: 100,
        });
        break;
      case "--subpage-target":
      case "--subpage-targets":
        state.subpageTargets.push(...parseList(readValue()));
        break;
      case "--links":
        state.generatedContents["extras"] = mergeObjects(
          getRecord(state.generatedContents["extras"]),
          {
            links: parseInteger(readValue(), flag.name, { min: 0, max: 1000 }),
          },
        );
        break;
      case "--image-links":
        state.generatedContents["extras"] = mergeObjects(
          getRecord(state.generatedContents["extras"]),
          {
            imageLinks: parseInteger(readValue(), flag.name, { min: 0, max: 1000 }),
          },
        );
        break;
      case "--rich-image-links":
        state.generatedContents["extras"] = mergeObjects(
          getRecord(state.generatedContents["extras"]),
          {
            richImageLinks: parseInteger(readValue(), flag.name, { min: 0, max: 1000 }),
          },
        );
        break;
      case "--rich-links":
        state.generatedContents["extras"] = mergeObjects(
          getRecord(state.generatedContents["extras"]),
          {
            richLinks: parseInteger(readValue(), flag.name, { min: 0, max: 1000 }),
          },
        );
        break;
      case "--code-blocks":
        state.generatedContents["extras"] = mergeObjects(
          getRecord(state.generatedContents["extras"]),
          {
            codeBlocks: parseInteger(readValue(), flag.name, { min: 0, max: 1000 }),
          },
        );
        break;
      case "--format":
        state.format = parseAllowed(readValue(), flag.name, OUTPUT_FORMATS) as OutputFormat;
        break;
      case "--json":
        state.format = "json";
        break;
      case "--urls":
        state.format = "urls";
        break;
      case "--compact":
        state.compact = true;
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

export function helpText(): string {
  return `exa-search ${VERSION}

Usage:
  exa-search [options] <query...>
  exa-search --query "latest AI policy updates" --num-results 5

Authentication:
      --api-key <key>                    Exa API key. Defaults to EXA_API_KEY.
      --base-url <url>                   API base URL. Defaults to EXA_BASE_URL or https://api.exa.ai.

Search options:
  -q, --query <query>                    Query text. Positional words are joined with spaces.
  -n, --num-results <1-100>              Number of results.
  -t, --type <type>                      auto, fast, instant, deep-lite, deep, deep-reasoning.
      --category <category>              company, publication, news, personal site, financial report, people.
      --user-location <ISO-2>            Two-letter country code.
      --include-domain <domain[,..]>     Restrict results to domains. Repeatable.
      --exclude-domain <domain[,..]>     Exclude domains. Repeatable.
      --start-published-date <date>      RFC 3339 lower publication date-time bound.
      --end-published-date <date>        RFC 3339 upper publication date-time bound.
      --moderation                       Filter unsafe content.
      --no-moderation                    Disable unsafe-content filtering.
      --additional-query <query>         Extra deep-search query variation. Repeatable, maximum 10.
      --system-prompt <prompt>           Instructions for synthesis/search planning.
      --output-schema <json|@file>       JSON schema for output.content.
      --compliance <mode>                Enterprise compliance mode: hipaa.
      --body <json|@file>                Base request JSON. CLI flags override matching fields.
      --stream                           Stream synthesized output when outputSchema is present.

Content options:
      --highlights                       Request highlights. Default unless --body or another content mode is used.
      --no-highlights                    Do not request highlights.
      --highlight-query <query>          Guide highlight selection.
      --highlight-max-characters <n>     Cap highlight characters per URL.
      --text                             Request full page text as markdown.
      --text-max-characters <n>          Cap text characters.
      --include-html-tags                Preserve HTML tags in text.
      --text-verbosity <level>           compact, standard, or full.
      --include-section <section[,..]>   Include only specific text sections. Repeatable.
      --exclude-section <section[,..]>   Exclude specific text sections. Repeatable.
      --summary                          Request LLM summary.
      --summary-query <query>            Custom summary query.
      --summary-schema <json|@file>      JSON schema for structured summary.
      --max-age-hours <n>                0 forces livecrawl, -1 never livecrawls.
      --livecrawl-timeout <ms>           Livecrawl timeout.
      --subpages <n>                     Crawl subpages per result.
      --subpage-target <keyword[,..]>    Prioritize subpages. Repeatable.
      --links <n>                        Extract URLs from each page.
      --image-links <n>                  Extract image URLs from each page.
      --rich-image-links <n>             Extract rich image links from each page.
      --rich-links <n>                   Extract rich links from each page.
      --code-blocks <n>                  Extract code blocks from each page.

Output options:
      --format <json|text|urls>          Output format. Default: json.
      --json                             Alias for --format json.
      --urls                             Alias for --format urls.
      --compact                          Minify JSON output.
      --timeout <ms>                     Request timeout. Default: 60000.
  -h, --help                             Show help.
  -V, --version                          Show version.

Examples:
  exa-search "recent quantum computing breakthroughs" --num-results 5
  exa-search "AI regulation" --category news --include-domain reuters.com,bbc.com --start-published-date 2025-01-01
  exa-search "compare frontier model releases" --type deep --system-prompt "Prefer official sources" --output-schema @schema.json
`;
}

export async function searchJson(options: CliRunOptions): Promise<unknown> {
  const response = await postSearch(options, "application/json");
  return response.json();
}

export async function streamSearch(
  options: CliRunOptions,
  write: (chunk: string) => void,
): Promise<void> {
  const expectsEventStream = isRecord(options.request["outputSchema"]);
  const response = await postSearch(
    options,
    expectsEventStream ? "text/event-stream" : "application/json",
  );

  if (!expectsEventStream) {
    const responseBody = (await response.json()) as unknown;
    write(formatResponse(responseBody, options.format, options.compact));
    return;
  }

  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "text/event-stream") {
    throw new CliError(
      `Streaming response must use text/event-stream, received ${mediaType ?? "no content type"}`,
    );
  }

  if (response.body === null) {
    throw new CliError("Streaming response did not include a body");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  while (true) {
    const read = await reader.read();
    if (read.done) {
      break;
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

export function formatResponse(response: unknown, format: OutputFormat, compact: boolean): string {
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

function buildCommand(state: ParseState, env: Environment): CliCommand {
  if (state.query !== undefined && state.positionalQuery.length > 0) {
    throw new CliError("Use either positional query text or --query, not both");
  }

  if (state.query !== undefined && state.query.length > 0) {
    state.generated["query"] = state.query;
  } else if (state.positionalQuery.length > 0) {
    state.generated["query"] = state.positionalQuery.join(" ");
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

  const contents = buildContents(state);
  if (Object.keys(contents).length > 0) {
    state.generated["contents"] = contents;
  }

  const request = mergeObjects(state.bodyBase ?? {}, state.generated);
  validateRequest(request);

  const apiKey = state.apiKey ?? env["EXA_API_KEY"];
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new CliError("Missing API key. Set EXA_API_KEY or pass --api-key.");
  }

  const baseUrl = state.baseUrl ?? env["EXA_BASE_URL"] ?? "https://api.exa.ai";

  return {
    kind: "run",
    options: {
      apiKey,
      baseUrl,
      compact: state.compact,
      format: state.format,
      request,
      stream: request["stream"] === true,
      timeoutMs: state.timeoutMs,
    },
  };
}

function buildContents(state: ParseState): Record<string, unknown> {
  const contents: Record<string, unknown> = {};
  const shouldDefaultHighlights =
    state.highlightPreference === "auto" &&
    !state.contentModeExplicit &&
    state.bodyBase === undefined;

  if (state.highlightPreference === "enabled" || shouldDefaultHighlights) {
    const highlightOptions: Record<string, unknown> = {};
    if (state.highlightQuery !== undefined) {
      highlightOptions["query"] = state.highlightQuery;
    }

    if (state.highlightMaxCharacters !== undefined) {
      highlightOptions["maxCharacters"] = state.highlightMaxCharacters;
    }

    contents["highlights"] = Object.keys(highlightOptions).length > 0 ? highlightOptions : true;
  }

  if (state.textEnabled) {
    if (state.includeSections.length > 0) {
      state.textOptions["includeSections"] = uniqueStrings(state.includeSections);
    }

    if (state.excludeSections.length > 0) {
      state.textOptions["excludeSections"] = uniqueStrings(state.excludeSections);
    }

    contents["text"] = Object.keys(state.textOptions).length > 0 ? state.textOptions : true;
  }

  if (state.summaryEnabled) {
    contents["summary"] = state.summaryOptions;
  }

  if (state.subpageTargets.length > 0) {
    const targets = uniqueStrings(state.subpageTargets);
    contents["subpageTarget"] = targets.length === 1 ? targets[0] : targets;
  }

  const generatedContents = getRecord(state.generatedContents);
  return mergeObjects(contents, generatedContents);
}

function validateRequest(request: Record<string, unknown>): void {
  const query = request["query"];
  if (typeof query !== "string" || query.length === 0) {
    throw new CliError(
      "A non-empty query is required. Pass positional query text, --query, or --body with query.",
    );
  }

  if (isPresent(request["type"])) {
    assertAllowedValue(request["type"], "type", SEARCH_TYPES);
  }

  if (isPresent(request["stream"]) && typeof request["stream"] !== "boolean") {
    throw new CliError("stream must be a boolean or null");
  }

  if (isPresent(request["numResults"])) {
    assertIntegerValue(request["numResults"], "numResults", { min: 1, max: 100 });
  }

  if (isPresent(request["category"])) {
    assertAllowedValue(request["category"], "category", CATEGORIES);
  }

  if (isPresent(request["userLocation"])) {
    if (
      typeof request["userLocation"] !== "string" ||
      !/^[A-Za-z]{2}$/.test(request["userLocation"])
    ) {
      throw new CliError("userLocation must be a two-letter ISO country code or null");
    }
  }

  if (isPresent(request["moderation"]) && typeof request["moderation"] !== "boolean") {
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

  if (isPresent(request["systemPrompt"]) && typeof request["systemPrompt"] !== "string") {
    throw new CliError("systemPrompt must be a string or null");
  }

  validateOutputSchema(request["outputSchema"]);
  validateStringArray(request["includeDomains"], "includeDomains", { maxItems: 1200 });
  validateStringArray(request["excludeDomains"], "excludeDomains", { maxItems: 1200 });
  validateStringArray(request["additionalQueries"], "additionalQueries", {
    minItems: 1,
    maxItems: 10,
  });

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
    validateContents(request["contents"]);
  }
}

function validateContents(value: unknown): void {
  if (value === null) {
    return;
  }

  if (!isRecord(value)) {
    throw new CliError("contents must be an object or null");
  }

  validateBooleanOrObject(value["highlights"], "contents.highlights");
  validateBooleanOrObject(value["text"], "contents.text");
  validateObjectOrNull(value["summary"], "contents.summary");
  validateTextOptions(value["text"]);
  validateHighlightOptions(value["highlights"]);
  validateSummaryOptions(value["summary"]);

  if (isPresent(value["livecrawlTimeout"])) {
    assertIntegerValue(value["livecrawlTimeout"], "contents.livecrawlTimeout", {
      min: 1,
      max: 90_000,
    });
  }

  if (isPresent(value["maxAgeHours"])) {
    assertIntegerValue(value["maxAgeHours"], "contents.maxAgeHours", { min: -1, max: 720 });
  }

  if (isPresent(value["subpages"])) {
    assertIntegerValue(value["subpages"], "contents.subpages", { min: 0, max: 100 });
  }

  validateSubpageTarget(value["subpageTarget"]);
  validateExtras(value["extras"]);
}

function validateTextOptions(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  if (isPresent(value["maxCharacters"])) {
    assertIntegerValue(value["maxCharacters"], "contents.text.maxCharacters", {
      min: 1,
      max: 10_000,
    });
  }

  if (isPresent(value["includeHtmlTags"]) && typeof value["includeHtmlTags"] !== "boolean") {
    throw new CliError("contents.text.includeHtmlTags must be a boolean or null");
  }

  if (isPresent(value["verbosity"])) {
    assertAllowedValue(value["verbosity"], "contents.text.verbosity", TEXT_VERBOSITIES);
  }

  validateStringArray(value["includeSections"], "contents.text.includeSections", {
    allowed: TEXT_SECTIONS,
  });
  validateStringArray(value["excludeSections"], "contents.text.excludeSections", {
    allowed: TEXT_SECTIONS,
  });
}

function validateHighlightOptions(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  if (isPresent(value["query"]) && typeof value["query"] !== "string") {
    throw new CliError("contents.highlights.query must be a string or null");
  }

  if (isPresent(value["maxCharacters"])) {
    assertIntegerValue(value["maxCharacters"], "contents.highlights.maxCharacters", {
      min: 1,
      max: 10_000,
    });
  }

  for (const field of ["numSentences", "highlightsPerUrl"]) {
    if (isPresent(value[field])) {
      assertIntegerValue(value[field], `contents.highlights.${field}`, { min: 1 });
    }
  }
}

function validateSummaryOptions(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  if (isPresent(value["query"]) && typeof value["query"] !== "string") {
    throw new CliError("contents.summary.query must be a string or null");
  }

  if (isPresent(value["schema"]) && !isRecord(value["schema"])) {
    throw new CliError("contents.summary.schema must be an object or null");
  }
}

function validateSubpageTarget(value: unknown): void {
  if (!isPresent(value)) {
    return;
  }

  if (typeof value === "string") {
    if (value.length < 1 || value.length > 100) {
      throw new CliError("contents.subpageTarget must contain between 1 and 100 characters");
    }
    return;
  }

  validateStringArray(value, "contents.subpageTarget", {
    maxItems: 100,
    minItemLength: 1,
    maxItemLength: 100,
  });
}

function validateExtras(value: unknown): void {
  if (!isPresent(value)) {
    return;
  }

  if (!isRecord(value)) {
    throw new CliError("contents.extras must be an object or null");
  }

  for (const field of ["links", "imageLinks", "richImageLinks", "richLinks", "codeBlocks"]) {
    if (isPresent(value[field])) {
      assertIntegerValue(value[field], `contents.extras.${field}`, { min: 0, max: 1000 });
    }
  }
}

function validateOutputSchema(value: unknown): void {
  if (!isPresent(value)) {
    return;
  }

  if (!isRecord(value)) {
    throw new CliError("outputSchema must be an object or null");
  }

  const type = value["type"];
  if (type !== "text" && type !== "object") {
    throw new CliError('outputSchema.type must be "text" or "object"');
  }

  if (value["description"] !== undefined && typeof value["description"] !== "string") {
    throw new CliError("outputSchema.description must be a string");
  }

  if (type === "object") {
    if (value["properties"] !== undefined && !isRecord(value["properties"])) {
      throw new CliError("outputSchema.properties must be an object");
    }
    if (value["required"] === null) {
      throw new CliError("outputSchema.required must be an array of strings");
    }
    validateStringArray(value["required"], "outputSchema.required");
    if (
      value["additionalProperties"] !== undefined &&
      typeof value["additionalProperties"] !== "boolean"
    ) {
      throw new CliError("outputSchema.additionalProperties must be a boolean");
    }
  }
}

function validateBooleanOrObject(value: unknown, field: string): void {
  if (!isPresent(value) || typeof value === "boolean" || isRecord(value)) {
    return;
  }

  throw new CliError(`${field} must be a boolean, object, or null`);
}

function validateObjectOrNull(value: unknown, field: string): void {
  if (!isPresent(value) || isRecord(value)) {
    return;
  }

  throw new CliError(`${field} must be an object or null`);
}

async function postSearch(options: CliRunOptions, accept: string): Promise<Response> {
  const response = await fetch(searchUrl(options.baseUrl), {
    body: JSON.stringify(options.request),
    headers: {
      accept,
      "content-type": "application/json",
      "x-api-key": options.apiKey,
    },
    method: "POST",
    signal: AbortSignal.timeout(options.timeoutMs),
  });

  if (!response.ok) {
    throw await buildHttpError(response);
  }

  return response;
}

async function buildHttpError(response: Response): Promise<CliError> {
  const text = await response.text();
  let detail = text.trim();

  if (detail !== "") {
    try {
      const parsed = JSON.parse(detail) as unknown;
      if (isRecord(parsed) && typeof parsed["error"] === "string") {
        detail = parsed["error"];
      }
    } catch {
      // Keep the plain text body.
    }
  }

  const message =
    detail === ""
      ? `${response.status} ${response.statusText}`
      : `${response.status} ${response.statusText}: ${detail}`;
  return new CliError(message);
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(data) as unknown;
  } catch {
    throw new CliError("Search stream contained invalid JSON data");
  }

  if (!isRecord(parsed) || typeof parsed["type"] !== "string") {
    throw new CliError("Search stream event must include a type");
  }

  switch (parsed["type"]) {
    case "text-delta":
      if (typeof parsed["delta"] !== "string") {
        throw new CliError("Search text-delta event must include a string delta");
      }
      write(parsed["delta"]);
      return;
    case "error":
      if (!isRecord(parsed["error"]) || typeof parsed["error"]["message"] !== "string") {
        throw new CliError("Search error event must include an error message");
      }
      throw new CliError(`Search stream error: ${parsed["error"]["message"]}`);
    case "grounding":
    case "results":
    case "stream-reset":
    case "done":
      return;
    default:
      throw new CliError(`Unknown search stream event type: ${parsed["type"]}`);
  }
}

function formatTextResponse(response: unknown): string {
  const lines: string[] = [];

  if (
    isRecord(response) &&
    isRecord(response["output"]) &&
    response["output"]["content"] !== undefined
  ) {
    lines.push(formatContentValue(response["output"]["content"]));
    lines.push("");
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

    const summary = stringField(result, "summary");
    if (summary !== undefined) {
      lines.push(indentBlock(summary, "   Summary: ", "            "));
    }

    if (Array.isArray(result["highlights"]) && result["highlights"].length > 0) {
      lines.push("   Highlights:");
      for (const highlight of result["highlights"]) {
        if (typeof highlight === "string") {
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

  if (isRecord(response)) {
    const requestId = stringField(response, "requestId");
    if (requestId !== undefined) {
      lines.push(`requestId: ${requestId}`);
    }

    if (isRecord(response["costDollars"]) && typeof response["costDollars"]["total"] === "number") {
      lines.push(`costDollars.total: ${response["costDollars"]["total"]}`);
    }
  }

  return trimTrailingBlankLines(lines).join("\n");
}

function extractResults(response: unknown): Record<string, unknown>[] {
  if (!isRecord(response) || !Array.isArray(response["results"])) {
    return [];
  }

  return response["results"].filter(isRecord);
}

function formatContentValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
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

function splitFlag(value: string): { name: string; inlineValue?: string } {
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

function parseJsonObject(value: string, flag: string): Record<string, unknown> {
  const parsed = parseJsonOrFile(value, flag);
  if (!isRecord(parsed)) {
    throw new CliError(`${flag} must be a JSON object`);
  }

  return parsed;
}

function parseJsonOrFile(value: string, flag: string): unknown {
  const source = value.startsWith("@") ? readJsonFile(value.slice(1), flag) : value;

  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError(`${flag} contains invalid JSON: ${reason}`);
  }
}

function readJsonFile(path: string, flag: string): string {
  try {
    return readFileSync(path === "-" ? 0 : path, "utf8");
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
  if (typeof value !== "number" || !Number.isInteger(value)) {
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
  if (typeof value !== "string") {
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

function parseAllowed(value: string, flag: string, allowed: readonly string[]): string {
  if (!allowed.includes(value)) {
    throw new CliError(`${flag} must be one of: ${allowed.join(", ")}`);
  }

  return value;
}

function parseAllowedList(value: string, flag: string, allowed: readonly string[]): string[] {
  return parseList(value).map((entry) => parseAllowed(entry, flag, allowed));
}

function assertAllowedValue(value: unknown, field: string, allowed: readonly string[]): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new CliError(`${field} must be one of: ${allowed.join(", ")}`);
  }
}

function parseUserLocation(value: string, flag: string): string {
  if (!/^[A-Za-z]{2}$/.test(value)) {
    throw new CliError(`${flag} must be a two-letter ISO country code`);
  }

  return value.toUpperCase();
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
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
): void {
  if (!isPresent(value)) {
    return;
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new CliError(`${field} must be an array of strings or null`);
  }

  if (bounds.minItems !== undefined && value.length < bounds.minItems) {
    throw new CliError(`${field} must contain at least ${bounds.minItems} entries`);
  }

  if (bounds.maxItems !== undefined && value.length > bounds.maxItems) {
    throw new CliError(`${field} must contain at most ${bounds.maxItems} entries`);
  }

  for (const entry of value as string[]) {
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

function mergeObjects(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];
    if (isRecord(baseValue) && isRecord(value)) {
      merged[key] = mergeObjects(baseValue, value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

function getRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPackageVersion(): string {
  const packageJson: unknown = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  if (!isRecord(packageJson) || typeof packageJson["version"] !== "string") {
    throw new Error("package.json must include a string version");
  }

  return packageJson["version"];
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function searchUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (trimmed.endsWith("/search")) {
    return trimmed;
  }

  return new URL("search", trimmed.endsWith("/") ? trimmed : `${trimmed}/`).toString();
}
