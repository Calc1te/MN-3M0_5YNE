import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "Bar_Counter",
  version: "v1.0.0",
});

const RUST_API_BASE = process.env.DATA_BARTENDER_API ?? "http://127.0.0.1:47821";

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

server.registerTool(
  "base_list",
  {
    title: "base_list",
    description: "Read discarded files list. Uses ~/Desktop by default.",
    inputSchema: {
      dir: z.string().optional().describe("Optional override directory path"),
    },
  },
  async ({ dir }) => {
    const result = await callRust<unknown[]>("/base/list", { dir });
    return asTextResult(result);
  },
);

server.registerTool(
  "get_base",
  {
    title: "get_base",
    description: "Get metadata and optional extracted text content for one file.",
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

server.registerTool("base", {
    title: "base/list",
    description: "Get list of available Bases.",
    inputSchema: {},
  },
  async () => {
    const result = await callRust<unknown[]>("/base/list", {});
    return asTextResult(result);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
