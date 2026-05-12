import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const RUST_API_BASE = process.env.DATA_BARTENDER_API ?? "http://127.0.0.1:47821";
const MCP_SSE_PORT = Number(process.env.MCP_SSE_PORT ?? 47822);

type ToolResult = { content: Array<{ type: "text"; text: string }> };

async function callRust<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${RUST_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
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
      description: "Add a text memory to the local LanceDB memory table.",
      inputSchema: {
        text: z.string().min(1),
        id: z.string().optional(),
        vector: z.array(z.number()).length(1024).optional(),
      },
    },
    async ({ text, id, vector }) => {
      const result = await callRust<unknown>("/memory/add", { text, id, vector });
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
