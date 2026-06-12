import { readFileSync } from "node:fs";

export const VERSION = "0.0.1-alpha.1";

const SEARCH_TYPES = ["auto", "fast", "instant", "deep-lite", "deep", "deep-reasoning"];
const CATEGORIES = [
  "company",
  "people",
  "research paper",
  "news",
  "personal site",
  "financial report",
];
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
        state.generated.numResults = parseInteger(readValue(), flag.name, { min: 1, max: 100 });
        break;
      case "-t":
      case "--type":
        state.generated.type = parseAllowed(readValue(), flag.name, SEARCH_TYPES);
        break;
      case "--category":
        state.generated.category = parseAllowed(readValue(), flag.name, CATEGORIES);
        break;
      case "--user-location":
        state.generated.userLocation = parseUserLocation(readValue(), flag.name);
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
        state.generated.startPublishedDate = readValue();
        break;
      case "--end-published-date":
        state.generated.endPublishedDate = readValue();
        break;
      case "--moderation":
        state.generated.moderation = true;
        break;
      case "--no-moderation":
        state.generated.moderation = false;
        break;
      case "--additional-query":
      case "--additional-queries":
        state.additionalQueries.push(readValue());
        break;
      case "--system-prompt":
        state.generated.systemPrompt = readValue();
        break;
      case "--output-schema":
        state.generated.outputSchema = parseJsonOrFile(readValue(), flag.name);
        break;
      case "--compliance":
        state.generated.compliance = readValue();
        break;
      case "--stream":
        state.generated.stream = true;
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
        state.highlightMaxCharacters = parseInteger(readValue(), flag.name, { min: 1 });
        break;
      case "--text":
        state.contentModeExplicit = true;
        state.textEnabled = true;
        break;
      case "--text-max-characters":
        state.contentModeExplicit = true;
        state.textEnabled = true;
        state.textOptions.maxCharacters = parseInteger(readValue(), flag.name, { min: 1 });
        break;
      case "--include-html-tags":
        state.contentModeExplicit = true;
        state.textEnabled = true;
        state.textOptions.includeHtmlTags = true;
        break;
      case "--text-verbosity":
        state.contentModeExplicit = true;
        state.textEnabled = true;
        state.textOptions.verbosity = parseAllowed(readValue(), flag.name, TEXT_VERBOSITIES);
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
        state.summaryOptions.query = readValue();
        break;
      case "--summary-schema":
        state.contentModeExplicit = true;
        state.summaryEnabled = true;
        state.summaryOptions.schema = parseJsonOrFile(readValue(), flag.name);
        break;
      case "--livecrawl-timeout":
        state.generatedContents.livecrawlTimeout = parseInteger(readValue(), flag.name, { min: 1 });
        break;
      case "--max-age-hours":
        state.generatedContents.maxAgeHours = parseInteger(readValue(), flag.name, { min: -1 });
        break;
      case "--subpages":
        state.generatedContents.subpages = parseInteger(readValue(), flag.name, { min: 0 });
        break;
      case "--subpage-target":
      case "--subpage-targets":
        state.subpageTargets.push(...parseList(readValue()));
        break;
      case "--links":
        state.generatedContents.extras = mergeObjects(getRecord(state.generatedContents.extras), {
          links: parseInteger(readValue(), flag.name, { min: 0 }),
        });
        break;
      case "--image-links":
        state.generatedContents.extras = mergeObjects(getRecord(state.generatedContents.extras), {
          imageLinks: parseInteger(readValue(), flag.name, { min: 0 }),
        });
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
  Set EXA_API_KEY, or pass --api-key. EXA_BASE_URL can override the API host.

Search options:
  -q, --query <query>                    Query text. Positional words are joined with spaces.
  -n, --num-results <1-100>              Number of results.
  -t, --type <type>                      auto, fast, instant, deep-lite, deep, deep-reasoning.
      --category <category>              company, people, research paper, news, personal site, financial report.
      --user-location <ISO-2>            Two-letter country code.
      --include-domain <domain[,..]>     Restrict results to domains. Repeatable.
      --exclude-domain <domain[,..]>     Exclude domains. Repeatable.
      --start-published-date <date>      ISO 8601 lower publication date bound.
      --end-published-date <date>        ISO 8601 upper publication date bound.
      --moderation                       Filter unsafe content.
      --additional-query <query>         Extra deep-search query variation. Repeatable.
      --system-prompt <prompt>           Instructions for synthesis/search planning.
      --output-schema <json|@file>       JSON schema for output.content.
      --body <json|@file>                Base request JSON. CLI flags override matching fields.
      --stream                           Request SSE streaming and print delta text.

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
  const response = await postSearch(options, "text/event-stream");
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

  if (state.query !== undefined && state.query.trim() !== "") {
    state.generated.query = state.query;
  } else if (state.positionalQuery.length > 0) {
    state.generated.query = state.positionalQuery.join(" ");
  }

  if (state.includeDomains.length > 0) {
    state.generated.includeDomains = uniqueStrings(state.includeDomains);
  }

  if (state.excludeDomains.length > 0) {
    state.generated.excludeDomains = uniqueStrings(state.excludeDomains);
  }

  if (state.additionalQueries.length > 0) {
    state.generated.additionalQueries = uniqueStrings(state.additionalQueries);
  }

  const contents = buildContents(state);
  if (Object.keys(contents).length > 0) {
    state.generated.contents = contents;
  }

  const request = mergeObjects(state.bodyBase ?? {}, state.generated);
  validateRequest(request);

  const apiKey = state.apiKey ?? env.EXA_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new CliError("Missing API key. Set EXA_API_KEY or pass --api-key.");
  }

  const baseUrl = state.baseUrl ?? env.EXA_BASE_URL ?? "https://api.exa.ai";

  return {
    kind: "run",
    options: {
      apiKey,
      baseUrl,
      compact: state.compact,
      format: state.format,
      request,
      stream: request.stream === true,
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
      highlightOptions.query = state.highlightQuery;
    }

    if (state.highlightMaxCharacters !== undefined) {
      highlightOptions.maxCharacters = state.highlightMaxCharacters;
    }

    contents.highlights = Object.keys(highlightOptions).length > 0 ? highlightOptions : true;
  }

  if (state.textEnabled) {
    if (state.includeSections.length > 0) {
      state.textOptions.includeSections = uniqueStrings(state.includeSections);
    }

    if (state.excludeSections.length > 0) {
      state.textOptions.excludeSections = uniqueStrings(state.excludeSections);
    }

    contents.text = Object.keys(state.textOptions).length > 0 ? state.textOptions : true;
  }

  if (state.summaryEnabled) {
    contents.summary = Object.keys(state.summaryOptions).length > 0 ? state.summaryOptions : true;
  }

  if (state.subpageTargets.length > 0) {
    const targets = uniqueStrings(state.subpageTargets);
    contents.subpageTarget = targets.length === 1 ? targets[0] : targets;
  }

  const generatedContents = getRecord(state.generatedContents);
  return mergeObjects(contents, generatedContents);
}

function validateRequest(request: Record<string, unknown>): void {
  const query = request.query;
  if (typeof query !== "string" || query.trim() === "") {
    throw new CliError(
      "A non-empty query is required. Pass positional query text, --query, or --body with query.",
    );
  }

  if (request.type !== undefined) {
    assertAllowedValue(request.type, "type", SEARCH_TYPES);
  }

  if (request.stream !== undefined && typeof request.stream !== "boolean") {
    throw new CliError("stream must be a boolean");
  }

  if (request.numResults !== undefined) {
    assertIntegerValue(request.numResults, "numResults", { min: 1, max: 100 });
  }

  if (request.category !== undefined) {
    assertAllowedValue(request.category, "category", CATEGORIES);
  }

  if (request.userLocation !== undefined) {
    if (typeof request.userLocation !== "string" || !/^[A-Za-z]{2}$/.test(request.userLocation)) {
      throw new CliError("userLocation must be a two-letter ISO country code");
    }
  }

  if (request.moderation !== undefined && typeof request.moderation !== "boolean") {
    throw new CliError("moderation must be a boolean");
  }

  validateStringArray(request.includeDomains, "includeDomains", 1200);
  validateStringArray(request.excludeDomains, "excludeDomains", 1200);
  validateStringArray(request.additionalQueries, "additionalQueries");

  if (request.category === "company" || request.category === "people") {
    const forbidden = ["excludeDomains", "startPublishedDate", "endPublishedDate"].filter(
      (field) => request[field] !== undefined,
    );
    if (forbidden.length > 0) {
      throw new CliError(`${request.category} category does not support: ${forbidden.join(", ")}`);
    }
  }

  if (request.contents !== undefined) {
    validateContents(request.contents);
  }
}

function validateContents(value: unknown): void {
  if (!isRecord(value)) {
    throw new CliError("contents must be an object");
  }

  validateBooleanOrObject(value.highlights, "contents.highlights");
  validateBooleanOrObject(value.text, "contents.text");
  validateBooleanOrObject(value.summary, "contents.summary");

  if (value.livecrawlTimeout !== undefined) {
    assertIntegerValue(value.livecrawlTimeout, "contents.livecrawlTimeout", { min: 1 });
  }

  if (value.maxAgeHours !== undefined) {
    assertIntegerValue(value.maxAgeHours, "contents.maxAgeHours", { min: -1 });
  }

  if (value.subpages !== undefined) {
    assertIntegerValue(value.subpages, "contents.subpages", { min: 0 });
  }

  if (value.subpageTarget !== undefined && typeof value.subpageTarget !== "string") {
    validateStringArray(value.subpageTarget, "contents.subpageTarget");
  }

  if (value.extras !== undefined) {
    if (!isRecord(value.extras)) {
      throw new CliError("contents.extras must be an object");
    }

    if (value.extras.links !== undefined) {
      assertIntegerValue(value.extras.links, "contents.extras.links", { min: 0 });
    }

    if (value.extras.imageLinks !== undefined) {
      assertIntegerValue(value.extras.imageLinks, "contents.extras.imageLinks", { min: 0 });
    }
  }
}

function validateBooleanOrObject(value: unknown, field: string): void {
  if (value === undefined || typeof value === "boolean" || isRecord(value)) {
    return;
  }

  throw new CliError(`${field} must be a boolean or object`);
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
      if (isRecord(parsed) && typeof parsed.error === "string") {
        detail = parsed.error;
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

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.choices)) {
      return;
    }

    const choice = parsed.choices[0];
    if (!isRecord(choice) || !isRecord(choice.delta) || typeof choice.delta.content !== "string") {
      return;
    }

    write(choice.delta.content);
  } catch {
    write(data);
  }
}

function formatTextResponse(response: unknown): string {
  const lines: string[] = [];

  if (isRecord(response) && isRecord(response.output) && response.output.content !== undefined) {
    lines.push(formatContentValue(response.output.content));
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

    if (Array.isArray(result.highlights) && result.highlights.length > 0) {
      lines.push("   Highlights:");
      for (const highlight of result.highlights) {
        if (typeof highlight === "string") {
          lines.push(indentBlock(highlight, "   - ", "     "));
        }
      }
    }

    const text = stringField(result, "text");
    if (text !== undefined && summary === undefined && !Array.isArray(result.highlights)) {
      lines.push(indentBlock(text, "   Text: ", "         "));
    }

    lines.push("");
  });

  if (isRecord(response)) {
    const requestId = stringField(response, "requestId");
    if (requestId !== undefined) {
      lines.push(`requestId: ${requestId}`);
    }

    if (isRecord(response.costDollars) && typeof response.costDollars.total === "number") {
      lines.push(`costDollars.total: ${response.costDollars.total}`);
    }
  }

  return trimTrailingBlankLines(lines).join("\n");
}

function extractResults(response: unknown): Record<string, unknown>[] {
  if (!isRecord(response) || !Array.isArray(response.results)) {
    return [];
  }

  return response.results.filter(isRecord);
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

function validateStringArray(value: unknown, field: string, maxLength?: number): void {
  if (value === undefined) {
    return;
  }

  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.trim() === "")
  ) {
    throw new CliError(`${field} must be an array of non-empty strings`);
  }

  if (maxLength !== undefined && value.length > maxLength) {
    throw new CliError(`${field} must contain at most ${maxLength} entries`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
