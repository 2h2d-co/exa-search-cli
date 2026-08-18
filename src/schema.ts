import type { CliEndpoint, JsonObject } from "./core.ts";

const nullable = (schema: JsonObject) => ({
  anyOf: [schema, { type: "null" }],
});

const stringArray = (options: JsonObject = {}) => ({
  items: { minLength: 1, type: "string" },
  type: "array",
  ...options,
});

const textSections = ["header", "navigation", "banner", "body", "sidebar", "footer", "metadata"];

const textOptions = {
  additionalProperties: false,
  properties: {
    excludeSections: nullable({
      items: { enum: textSections, type: "string" },
      type: "array",
    }),
    includeHtmlTags: nullable({ default: false, type: "boolean" }),
    includeSections: nullable({
      items: { enum: textSections, type: "string" },
      type: "array",
    }),
    maxCharacters: nullable({ maximum: 10_000, minimum: 1, type: "integer" }),
    verbosity: nullable({
      default: "compact",
      enum: ["compact", "standard", "full"],
      type: "string",
    }),
  },
  type: "object",
};

const highlightsOptions = {
  additionalProperties: false,
  properties: {
    maxCharacters: nullable({ maximum: 10_000, minimum: 1, type: "integer" }),
    query: nullable({ minLength: 1, type: "string" }),
  },
  type: "object",
};

const summaryOptions = {
  additionalProperties: false,
  properties: {
    query: nullable({ minLength: 1, type: "string" }),
    schema: nullable({ type: "object" }),
  },
  type: "object",
};

const extrasOptions = {
  additionalProperties: false,
  properties: Object.fromEntries(
    ["codeBlocks", "imageLinks", "links", "richImageLinks", "richLinks"].map((name) => [
      name,
      nullable({ default: 0, maximum: 1000, minimum: 0, type: "integer" }),
    ]),
  ),
  type: "object",
};

const contentProperties = {
  extras: nullable(extrasOptions),
  highlights: {
    anyOf: [{ type: "boolean" }, highlightsOptions, { type: "null" }],
    default: true,
    description:
      "Token-efficient source excerpts. Enabled by default unless another mode is chosen.",
  },
  livecrawlTimeout: nullable({
    default: 10_000,
    exclusiveMinimum: 0,
    maximum: 90_000,
    type: "integer",
  }),
  maxAgeHours: nullable({ maximum: 720, minimum: -1, type: "integer" }),
  subpages: nullable({ default: 0, maximum: 100, minimum: 0, type: "integer" }),
  subpageTarget: nullable({
    anyOf: [
      { maxLength: 100, minLength: 1, type: "string" },
      {
        items: { maxLength: 100, minLength: 1, type: "string" },
        maxItems: 100,
        type: "array",
      },
    ],
  }),
  summary: nullable(summaryOptions),
  text: {
    anyOf: [{ type: "boolean" }, textOptions, { type: "null" }],
    description:
      "Full page text. The focused --text flag caps this at 10000 characters per result.",
  },
};

const outputSchema = nullable({
  description: "Schema for synthesized output.content.",
  oneOf: [
    {
      additionalProperties: false,
      properties: {
        description: { type: "string" },
        type: { const: "text", type: "string" },
      },
      required: ["type"],
      type: "object",
    },
    {
      properties: {
        additionalProperties: { type: "boolean" },
        description: { type: "string" },
        properties: { type: "object" },
        required: stringArray(),
        type: { const: "object", type: "string" },
      },
      required: ["type"],
      type: "object",
    },
  ],
  type: "object",
});

const searchSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  description: "Effective request body accepted by `exa-search search --body`.",
  properties: {
    additionalQueries: nullable(stringArray({ maxItems: 10, minItems: 1 })),
    category: nullable({
      enum: ["company", "publication", "news", "personal site", "financial report", "people"],
      type: "string",
    }),
    compliance: nullable({ enum: ["hipaa"], type: "string" }),
    contents: nullable({
      additionalProperties: false,
      properties: contentProperties,
      type: "object",
    }),
    endPublishedDate: nullable({ format: "date-time", type: "string" }),
    excludeDomains: nullable(stringArray({ maxItems: 1200 })),
    includeDomains: nullable(stringArray({ maxItems: 1200 })),
    moderation: nullable({ default: false, type: "boolean" }),
    numResults: nullable({
      default: 5,
      description: "CLI default selected for bounded coding-agent workflows.",
      maximum: 100,
      minimum: 1,
      type: "integer",
    }),
    outputSchema,
    query: { minLength: 1, type: "string" },
    startPublishedDate: nullable({ format: "date-time", type: "string" }),
    stream: nullable({ default: false, type: "boolean" }),
    systemPrompt: nullable({ minLength: 1, type: "string" }),
    type: nullable({
      default: "auto",
      enum: ["instant", "fast", "auto", "deep-lite", "deep", "deep-reasoning"],
      type: "string",
    }),
    userLocation: nullable({ pattern: "^[A-Za-z]{2}$", type: "string" }),
  },
  required: ["query"],
  title: "Exa Search request",
  type: "object",
} satisfies JsonObject;

const sourceArray = stringArray({
  items: { maxLength: 2048, minLength: 1, type: "string" },
  maxItems: 100,
  minItems: 1,
});

const extractSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  description: "Effective request body accepted by `exa-search extract --body`.",
  oneOf: [{ required: ["urls"] }, { required: ["ids"] }],
  properties: {
    ...contentProperties,
    compliance: nullable({ enum: ["hipaa"], type: "string" }),
    ids: sourceArray,
    urls: sourceArray,
  },
  title: "Exa Contents request",
  type: "object",
} satisfies JsonObject;

export function requestSchema(endpoint: CliEndpoint) {
  return endpoint === "search" ? searchSchema : extractSchema;
}
