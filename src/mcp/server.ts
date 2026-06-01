import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import "dotenv/config";
import { changeBartenderState } from "../uiControllers/bartender";

const RUST_API_BASE = process.env.DATA_BARTENDER_API ?? "http://127.0.0.1:47821";
const MCP_SSE_PORT = Number(process.env.MCP_SSE_PORT ?? 47822);
const EMBEDDING_DIMS = 1024;

type ToolResult = { content: Array<{ type: "text"; text: string }> };

interface EmbeddingResponse {
  embedding?: number[];
  object?: string;
  data?: Array<{
    embedding?: number[];
  }> | {
    embedding?: number[];
  };
  error?: {
    message?: string;
  };
}

function getEmbeddingFromPayload(payload: EmbeddingResponse): number[] | undefined {
  if (Array.isArray(payload.embedding)) {
    return payload.embedding;
  }
  if (Array.isArray(payload.data)) {
    return payload.data[0]?.embedding;
  }
  return payload.data?.embedding;
}

async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.VITE_BARTENDER_LLM_API_KEY;
  const model = process.env.VITE_EMBD_MODEL;
  const baseUrl = process.env.VITE_EMBD_URL;
  if (!apiKey) {
    throw new Error("Missing VITE_BARTENDER_LLM_API_KEY");
  }
  if (!model) {
    throw new Error("Missing VITE_EMBD_MODEL");
  }
  if (!baseUrl) {
    throw new Error("Missing VITE_EMBD_URL");
  }

  console.error(
    `[mcp] embedText:start url=${baseUrl} model=${model} chars=${text.length}`,
  );
  const startedAt = Date.now();
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model,
    }),
  });
  console.error(
    `[mcp] embedText:response status=${response.status} elapsed_ms=${Date.now() - startedAt}`,
  );

  const responseText = await response.text();
  console.error(`[mcp] embedText:body chars=${responseText.length}`);
  const payload = responseText ? (JSON.parse(responseText) as EmbeddingResponse) : {};
  if (!response.ok) {
    console.error("[mcp] embedText:error", responseText);
    throw new Error(payload.error?.message ?? `Embedding request failed: ${response.status}`);
  }

  const embedding = getEmbeddingFromPayload(payload);
  if (!Array.isArray(embedding)) {
    console.error("[mcp] embedText:missing_embedding payload_keys=", Object.keys(payload));
    throw new Error("Embedding response did not include data.embedding");
  }
  console.error(`[mcp] embedText:embedding length=${embedding.length}`);
  if (embedding.length !== EMBEDDING_DIMS) {
    throw new Error(`Embedding must be ${EMBEDDING_DIMS} values, got ${embedding.length}`);
  }

  return embedding;
}

function buildMemoryEmbeddingText(text: string, tags: string[]): string {
  if (tags.length === 0) {
    return text;
  }
  return `tags: ${tags.join(", ")}\ntext: ${text}`;
}

function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.flatMap(normalizeTags);
  }
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  if (tags && typeof tags === "object") {
    const values = Object.values(tags).flatMap(normalizeTags);
    return values.length > 0 ? values : [JSON.stringify(tags)];
  }
  return [];
}

async function callRust<T>(path: string, body: unknown): Promise<T> {
  console.error(`[mcp] callRust:start path=${path}`);
  const startedAt = Date.now();
  const response = await fetch(`${RUST_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  console.error(
    `[mcp] callRust:response path=${path} status=${response.status} elapsed_ms=${Date.now() - startedAt} body_chars=${text.length}`,
  );
  const payload = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const errorText =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with status ${response.status}`;
    throw new Error(errorText);
  }

  return payload as T;
}

function asTextResult(payload: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function createServer(): McpServer {
  const server = new McpServer({
    name: "Bar_Counter",
    version: "v1.0.0",
  });

  server.registerTool(
    "base_list",
    {
      title: "base_list",
      description: "Read discarded files from the user-configured base directory.",
      inputSchema: {},
    },
    async () => {
      const result = await callRust<unknown[]>("/base/list", {});
      return asTextResult(result);
    },
  );

  server.registerTool(
    "get_base",
    {
      title: "get_base",
      description:
        "Get metadata and optional extracted text content for one file. Relative paths are resolved from the user-configured base directory.",
      inputSchema: {
        path: z.string().min(1),
        include_content: z.boolean().optional().default(true),
        max_chars: z.number().int().min(1).max(20000).optional().default(2000),
      },
    },
    async ({ path, include_content, max_chars }) => {
      const result = await callRust<unknown>("/base/get", {
        path,
        include_content,
        max_chars,
      });
      return asTextResult(result);
    },
  );

  server.registerTool(
    "add_memory",
    {
      title: "add_memory",
      description:
        "Embed and add a text memory to the local LanceDB memory table. Text is stored once; tags are metadata and are also included in the embedding text.",
      inputSchema: {
        text: z.string().min(1),
        tags: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe("Optional tag string or string array."),
      },
    },
    async ({ text, tags }) => {
      console.error("[mcp] add_memory:start", { textChars: text.length, tags });
      const normalizedTags = normalizeTags(tags);
      console.error("[mcp] add_memory:normalized_tags", normalizedTags);
      const vector = await embedText(buildMemoryEmbeddingText(text, normalizedTags));
      console.error("[mcp] add_memory:embedding_ready", { dims: vector.length });
      const result = await callRust<unknown>("/memory/add", {
        text,
        tags: normalizedTags,
        vector,
      });
      console.error("[mcp] add_memory:done");
      return asTextResult(result);
    },
  );

  server.registerTool(
    "retrieve_memory",
    {
      title: "retrieve_memory",
      description: "Retrieve matching memories from the local LanceDB memory table.",
      inputSchema: {
        text: z.string().min(1),
      },
    },
    async ({ text }) => {
      console.error("[mcp] retrieve_memory:start", { textChars: text.length });
      const vector = await embedText(text);
      console.error("[mcp] retrieve_memory:embedding_ready", { dims: vector.length });
      const result = await callRust<unknown>("/memory/retrieve", { vector });
      console.error("[mcp] retrieve_memory:done");
      return asTextResult(result);
    },
  );

  server.registerTool(
    "mix_data_drink",
    {
      title: "mix_data_drink",
      description: "Stage selected files into ./.bar and return a drink_id.",
      inputSchema: {
        file_paths: z.array(z.string()).min(1),
      },
    },
    async ({ file_paths }) => {
      const result = await callRust<unknown>("/mix", { file_paths });
      return asTextResult(result);
    },
  );

  server.registerTool(
    "finalize_drink",
    {
      title: "finalize_drink",
      description: "Finalize staged files: drink=delete, restore=move back.",
      inputSchema: {
        drink_id: z.string().min(1),
        action: z.enum(["drink", "restore"]),
      },
    },
    async ({ drink_id, action }) => {
      const result = await callRust<unknown>("/mix/finalize", { drink_id, action });
      return asTextResult(result);
    },
  );

  server.registerTool(
    "permanently_delete",
    {
      title: "permanently_delete",
      description: "Permanently delete the target file/folder path.",
      inputSchema: {
        path: z.string().min(1),
      },
    },
    async ({ path }) => {
      const result = await callRust<unknown>("/base/delete", { path });
      return asTextResult(result);
    },
  );

  server.registerTool(
    "change_state",
    {
      title: "change sprite state",
      description: "Change the sprite of the bartender. Available states: idle/shaking/smoking/lookingAtYou",
      inputSchema: {
        state: z.string().min(1),
      },
    },
    async ({ state }) => {
      const nextState = changeBartenderState(state);
      return asTextResult({ ok: true, state: nextState });
    },
  )


  return server;
}

async function startStdioServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
}

function startSseServer(): void {
  const app = createMcpExpressApp();
  const transports: Record<string, SSEServerTransport> = {};

  app.get("/mcp", async (_req: any, res: any) => {
    try {
      const transport = new SSEServerTransport("/messages", res);
      transports[transport.sessionId] = transport;
      transport.onclose = () => {
        delete transports[transport.sessionId];
      };

      await createServer().connect(transport);
    } catch (error) {
      console.error("Error establishing MCP SSE stream:", error);
      if (!res.headersSent) {
        res.status(500).send("Error establishing MCP SSE stream");
      }
    }
  });

  app.post("/messages", async (req: any, res: any) => {
    const sessionId = String(req.query.sessionId ?? "");
    const transport = transports[sessionId];
    if (!sessionId || !transport) {
      res.status(404).send("MCP SSE session not found");
      return;
    }

    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP SSE message:", error);
      if (!res.headersSent) {
        res.status(500).send("Error handling MCP SSE message");
      }
    }
  });

  app.listen(MCP_SSE_PORT, () => {
    console.error(`MCP SSE server listening on http://localhost:${MCP_SSE_PORT}/mcp`);
    console.error(`Forwarding tool calls to Rust API at ${RUST_API_BASE}`);
  });
}

if (process.argv.includes("--sse") || process.env.MCP_TRANSPORT === "sse") {
  startSseServer();
} else {
  await startStdioServer();
}
