import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { CliError, type CliRunOptions, searchJson, streamSearch } from "../src/core.ts";

void test("streams OpenAPI text-delta events and ignores metadata events", async () => {
  await withServer(
    async (request, response) => {
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/search");
      assert.equal(request.headers["x-api-key"], "test-key");
      assert.equal(request.headers.accept, "text/event-stream");
      assert.deepEqual(JSON.parse(await readBody(request)), {
        outputSchema: { type: "text" },
        query: "query",
        stream: true,
      });

      response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      response.end(
        [
          'data: {"type":"results","results":[]}',
          "",
          'data: {"type":"text-delta","delta":"Hello"}',
          "",
          'data: {"type":"grounding","grounding":[]}',
          "",
          'data: {"type":"text-delta","delta":" world"}',
          "",
          'data: {"type":"done","output":null,"searchTime":1}',
          "",
          "data: [DONE]",
          "",
        ].join("\n"),
      );
    },
    async (baseUrl) => {
      let output = "";
      await streamSearch(
        makeOptions(baseUrl, {
          outputSchema: { type: "text" },
          query: "query",
          stream: true,
        }),
        (chunk) => {
          output += chunk;
        },
      );
      assert.equal(output, "Hello world");
    },
  );
});

void test("uses the OpenAPI JSON response when stream has no outputSchema", async () => {
  await withServer(
    async (request, response) => {
      assert.equal(request.headers.accept, "application/json");
      await readBody(request);
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"results":[{"title":"One","url":"https://example.com"}]}');
    },
    async (baseUrl) => {
      let output = "";
      await streamSearch(
        { ...makeOptions(baseUrl, { query: "query", stream: true }), compact: true },
        (chunk) => {
          output += chunk;
        },
      );
      assert.equal(output, '{"results":[{"title":"One","url":"https://example.com"}]}');
    },
  );
});

void test("surfaces OpenAPI stream error events", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end('data: {"type":"error","error":{"message":"boom"}}\n\n');
    },
    async (baseUrl) => {
      await assert.rejects(
        streamSearch(
          makeOptions(baseUrl, {
            outputSchema: { type: "text" },
            query: "query",
            stream: true,
          }),
          () => undefined,
        ),
        (error: unknown) =>
          error instanceof CliError && error.message === "Search stream error: boom",
      );
    },
  );
});

void test("rejects stream chunks outside the OpenAPI schema", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end('data: {"choices":[{"delta":{"content":"legacy"}}]}\n\n');
    },
    async (baseUrl) => {
      await assert.rejects(
        streamSearch(
          makeOptions(baseUrl, {
            outputSchema: { type: "text" },
            query: "query",
            stream: true,
          }),
          () => undefined,
        ),
        (error: unknown) =>
          error instanceof CliError && error.message === "Search stream event must include a type",
      );
    },
  );
});

void test("requires the OpenAPI event-stream media type for synthesized streams", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"results":[]}');
    },
    async (baseUrl) => {
      await assert.rejects(
        streamSearch(
          makeOptions(baseUrl, {
            outputSchema: { type: "text" },
            query: "query",
            stream: true,
          }),
          () => undefined,
        ),
        /Streaming response must use text\/event-stream/,
      );
    },
  );
});

void test("reports JSON API errors", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(422, { "content-type": "application/json" });
      response.end('{"error":"invalid request"}');
    },
    async (baseUrl) => {
      await assert.rejects(
        searchJson(makeOptions(baseUrl, { query: "query" })),
        (error: unknown) =>
          error instanceof CliError &&
          error.message === "422 Unprocessable Entity: invalid request",
      );
    },
  );
});

function makeOptions(baseUrl: string, request: Record<string, unknown>): CliRunOptions {
  return {
    apiKey: "test-key",
    baseUrl,
    compact: false,
    format: "json",
    request,
    stream: request["stream"] === true,
    timeoutMs: 1000,
  };
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function withServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
