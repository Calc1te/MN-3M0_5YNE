import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions/completions";
import i18n, { getCurrentLanguage } from "./i18n";

export type Role = "user" | "assistant" | "system";

export interface ChatTurn {
  role: Role;
  content: string;
}

export interface McpToolCall {
  tool: "base_list" | "get_base" | "mix_data_drink" | "finalize_drink" | "add_memory";
  args: Record<string, unknown>;
}

export interface BartenderReply {
  assistant: string;
  toolCalls: McpToolCall[];
}

const BARTENDER_API =
  import.meta.env.VITE_BARTENDER_URL ?? "https://ark.cn-beijing.volces.com/api/v3";

function createOpenAiClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: BARTENDER_API,
    dangerouslyAllowBrowser: true,
  });
}

function getSystemPrompt(): string {
  const language = getCurrentLanguage();
  return i18n.getFixedT(language)("prompts.system");
}

function toChatMessages(history: ChatTurn[], userInput: string): ChatCompletionMessageParam[] {
  const historyMessages: ChatCompletionMessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  return [
    { role: "system", content: getSystemPrompt() },
    ...historyMessages,
    { role: "user", content: userInput },
  ];
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function parseModelJson(raw: string): BartenderReply {
  const parsed = JSON.parse(extractJsonText(raw)) as Partial<BartenderReply>;
  const assistant = typeof parsed.assistant === "string" ? parsed.assistant : "……";
  const toolCalls = Array.isArray(parsed.toolCalls)
    ? parsed.toolCalls.filter(
        (t): t is McpToolCall =>
          typeof t === "object" &&
          t !== null &&
          "tool" in t &&
          "args" in t &&
          typeof (t as { tool: unknown }).tool === "string" &&
          typeof (t as { args: unknown }).args === "object" &&
          (t as { args: unknown }).args !== null,
      )
    : [];

  return { assistant, toolCalls };
}

export async function chatWithBartender(
  userInput: string,
  history: ChatTurn[] = [],
): Promise<BartenderReply> {
  const apiKey = import.meta.env.VITE_BARTENDER_LLM_API_KEY;
  if (!apiKey) {
    throw new Error(i18n.t("errors.missingApiKey"));
  }

  const model = import.meta.env.VITE_BARTENDER_MODEL;
  if (!model) {
    throw new Error("Missing VITE_ARK_ENDPOINT_ID");
  }

  const openai = createOpenAiClient(apiKey);
  const request: ChatCompletionCreateParamsNonStreaming = {
    model,
    temperature: 0.7,
    messages: toChatMessages(history, userInput),
  };

  const completion = await openai.chat.completions.create(request);

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error(i18n.t("errors.emptyModelResponse"));
  }

  return parseModelJson(content);
}

export interface McpTransport {
  callTool: (tool: McpToolCall["tool"], args: Record<string, unknown>) => Promise<unknown>;
}

export async function runMcpToolCalls(
  calls: McpToolCall[],
  transport: McpTransport,
): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const call of calls) {
    const result = await transport.callTool(call.tool, call.args);
    results.push(result);
  }
  return results;
}

const DEFAULT_MCP_DEBUG_BASE =
  import.meta.env.VITE_MCP_DEBUG_BASE ?? "http://127.0.0.1:47821";

const MCP_ENDPOINTS: Record<McpToolCall["tool"], string> = {
  base_list: "/base/list",
  get_base: "/base/get",
  mix_data_drink: "/mix",
  finalize_drink: "/mix/finalize",
  add_memory: "/memory/add",
};

function normalizeToolArgs(
  tool: McpToolCall["tool"],
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (tool === "mix_data_drink" && !("file_paths" in args) && Array.isArray(args.ingredients)) {
    return { ...args, file_paths: args.ingredients };
  }
  return args;
}

export function createLocalMcpTransport(baseUrl = DEFAULT_MCP_DEBUG_BASE): McpTransport {
  return {
    callTool: async (tool, args) => {
      const endpoint = MCP_ENDPOINTS[tool];
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(normalizeToolArgs(tool, args)),
      });

      const text = await response.text();
      const payload = text ? (JSON.parse(text) as unknown) : {};
      if (!response.ok) {
        const error =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error: unknown }).error)
            : `MCP debug call failed: ${response.status}`;
        throw new Error(error);
      }
      return payload;
    },
  };
}

export interface DebugMcpEntry {
  baseUrl: string;
  callTool: McpTransport["callTool"];
  chatThenRunTools: (
    userInput: string,
    history?: ChatTurn[],
  ) => Promise<{ reply: BartenderReply; toolResults: unknown[] }>;
}

declare global {
  interface Window {
    __BAR_MCP_DEBUG__?: DebugMcpEntry;
  }
}

export function installDebugMcpEntry(baseUrl = DEFAULT_MCP_DEBUG_BASE): void {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  const transport = createLocalMcpTransport(baseUrl);
  window.__BAR_MCP_DEBUG__ = {
    baseUrl,
    callTool: transport.callTool,
    chatThenRunTools: async (userInput, history = []) => {
      const reply = await chatWithBartender(userInput, history);
      const toolResults = await runMcpToolCalls(reply.toolCalls, transport);
      return { reply, toolResults };
    },
  };
}
