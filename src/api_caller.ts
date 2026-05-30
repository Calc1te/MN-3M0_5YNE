import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions/completions";
import { invoke } from "@tauri-apps/api/core";
import i18n, { getCurrentLanguage } from "./i18n";

export type Role = "user" | "assistant" | "system";

export interface ChatTurn {
  role: Role;
  content: string;
}

export interface McpToolCall {
  tool:
    | "base_list"
    | "get_base"
    | "mix_data_drink"
    | "finalize_drink"
    | "add_memory"
    | "retrieve_memory"
    | "change_state";
  args: Record<string, unknown>;
}

export interface BartenderReply {
  assistant: string;
  toolCalls: McpToolCall[];
}

export interface memoryEntry {
  vector: Float32Array;
  content: string;
}

enum ModelType {
  Bartender,
}

const BARTENDER_API =
  import.meta.env.VITE_BARTENDER_URL;

const EMBD_API =
  import.meta.env.VITE_EMBD_URL;

const CHAT_COMPLETIONS_SUFFIX = "/chat/completions";

function normalizeChatCompletionsBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) {
    return undefined;
  }

  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith(CHAT_COMPLETIONS_SUFFIX)
    ? trimmed.slice(0, -CHAT_COMPLETIONS_SUFFIX.length)
    : trimmed;
}

function createOpenAiClient(apiKey: string, model: ModelType): OpenAI {
  const baseURL =
    model === ModelType.Bartender
      ? normalizeChatCompletionsBaseUrl(BARTENDER_API)
      : normalizeChatCompletionsBaseUrl(BARTENDER_API);

  return new OpenAI({
    apiKey,
    baseURL,
    dangerouslyAllowBrowser: true,
  });
}

type ArkMultimodalEmbeddingInput =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    }
  | {
      type: "video_url";
      video_url: {
        url: string;
      };
    };

interface ArkMultimodalEmbeddingResponse {
  data?: {
    embedding?: number[];
  };
  error?: {
    message?: string;
  };
}

function buildEmbeddingUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed;
}

function getSystemPrompt(): string {
  const language = getCurrentLanguage();
  return i18n.getFixedT(language)("prompts.system");
}

interface StartupContext {
  Name?: string;
  Last_Activated?: number;
  Bar_Path?: string;
}

async function buildStartupLine(): Promise<string> {
  try {
    const language = getCurrentLanguage();
    const t = i18n.getFixedT(language);
    const context = await invoke<StartupContext>("get_startup_context");
    const lastActivated =
      typeof context.Last_Activated === "number" ? context.Last_Activated : 0;
    const userName =
      typeof context.Name === "string" && context.Name.trim()
        ? context.Name.trim()
        : "User";

    if (lastActivated === 0) {
      return t("prompts.startup.first");
    }

    const nowSecs = Math.floor(Date.now() / 1000);
    const days = Math.floor(Math.max(0, nowSecs - lastActivated) / 86400);
    if (days < 7) {
      return "";
    }

    return t("prompts.startup.stale", { user: userName, days });
  } catch (error) {
    console.warn("Failed to load startup context:", error);
    return "";
  }
}

async function getSystemPromptWithContext(): Promise<string> {
  const base = getSystemPrompt();
  const extra = await buildStartupLine();
  return extra ? `${base}\n\n${extra}` : base;
}

async function toChatMessages(
  history: ChatTurn[],
  userInput: string,
): Promise<ChatCompletionMessageParam[]> {
  const historyMessages: ChatCompletionMessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  return [
    { role: "system", content: await getSystemPromptWithContext() },
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
  try {
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

    const reply: BartenderReply = { assistant, toolCalls };

    try {
      console.log("reply:", JSON.stringify(reply, null, 2));
    } catch {
      console.log("reply:", reply);
    }

    return reply;
  } catch (err) {
    console.error("Failed to parse model JSON:", err, "raw:", raw);
    return { assistant: "……", toolCalls: [] };
  }
}

function decodeJsonStringFragment(fragment: string): string {
  let safeFragment = fragment;
  if (safeFragment.endsWith("\\")) {
    safeFragment = safeFragment.slice(0, -1);
  }
  safeFragment = safeFragment.replace(/\\u[0-9a-fA-F]{0,3}$/, "");

  try {
    return JSON.parse(`"${safeFragment}"`) as string;
  } catch {
    return safeFragment
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");
  }
}

function extractAssistantPreview(raw: string): string {
  const match = raw.match(/"assistant"\s*:\s*"/);
  if (!match || match.index === undefined) {
    return "";
  }

  const start = match.index + match[0].length;
  let escaped = false;
  let fragment = "";

  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      fragment += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      break;
    }
    fragment += char;
  }

  if (escaped) {
    fragment += "\\";
  }

  return decodeJsonStringFragment(fragment);
}

export async function chatWithBartender(
  userInput: string,
  history: ChatTurn[] = [],
): Promise<BartenderReply> {
  if (!BARTENDER_API) {
    throw new Error("Missing VITE_BARTENDER_URL");
  }

  const apiKey = import.meta.env.VITE_BARTENDER_LLM_API_KEY;
  if (!apiKey) {
    throw new Error(i18n.t("errors.missingApiKey"));
  }

  const model = import.meta.env.VITE_BARTENDER_MODEL;
  if (!model) {
    throw new Error("Missing VITE_ARK_ENDPOINT_ID");
  }

  const openai = createOpenAiClient(apiKey, ModelType.Bartender);
  const request: ChatCompletionCreateParamsNonStreaming = {
    model,
    temperature: 0.7,
    messages: await toChatMessages(history, userInput),
  };

  const completion = await openai.chat.completions.create(request);

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error(i18n.t("errors.emptyModelResponse"));
  }

  return parseModelJson(content);
}

export async function chatWithBartenderStream(
  userInput: string,
  history: ChatTurn[] = [],
  onAssistantText?: (text: string) => void,
): Promise<BartenderReply> {
  if (!BARTENDER_API) {
    throw new Error("Missing VITE_BARTENDER_URL");
  }

  const apiKey = import.meta.env.VITE_BARTENDER_LLM_API_KEY;
  if (!apiKey) {
    throw new Error(i18n.t("errors.missingApiKey"));
  }

  const model = import.meta.env.VITE_BARTENDER_MODEL;
  if (!model) {
    throw new Error("Missing VITE_ARK_ENDPOINT_ID");
  }

  const openai = createOpenAiClient(apiKey, ModelType.Bartender);
  const stream = await openai.chat.completions.create({
    model,
    temperature: 0.7,
    messages: await toChatMessages(history, userInput),
    stream: true,
  });

  let raw = "";
  let lastAssistantText = "";
  for await (const part of stream) {
    const content = part.choices[0]?.delta?.content ?? "";
    if (!content) {
      continue;
    }

    raw += content;
    const nextAssistantText = extractAssistantPreview(raw);
    if (nextAssistantText && nextAssistantText !== lastAssistantText) {
      lastAssistantText = nextAssistantText;
      onAssistantText?.(nextAssistantText);
    }
  }

  if (!raw.trim()) {
    throw new Error(i18n.t("errors.emptyModelResponse"));
  }

  const reply = parseModelJson(raw);
  if (reply.assistant !== lastAssistantText) {
    onAssistantText?.(reply.assistant);
  }
  return reply;
}

export async function createMemoryVector(
  memoryText: string,
  memoryContent: string,
): Promise<memoryEntry> {
  const apiKey = import.meta.env.VITE_BARTENDER_LLM_API_KEY;
  if (!apiKey) {
    throw new Error(i18n.t("errors.missingApiKey"));
  }

  const model = import.meta.env.VITE_EMBD_MODEL;
  if (!model) {
    throw new Error("Missing VITE_EMBD_MODEL");
  }

  const input: ArkMultimodalEmbeddingInput[] = [
    {
      type: "text",
      text: memoryText,
    },
  ];
  const response = await fetch(buildEmbeddingUrl(EMBD_API), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      encoding_format: "float",
      dimensions: "1024",
      input,
    }),
  });

  const payload = (await response.json()) as ArkMultimodalEmbeddingResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Embedding request failed: ${response.status}`);
  }

  const embedding = payload.data?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Embedding response did not include data.embedding");
  }

  return {
    vector: Float32Array.from(embedding),
    content: memoryContent,
  };
}

function normalizeMemoryTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.flatMap(normalizeMemoryTags);
  }
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  if (tags && typeof tags === "object") {
    const values = Object.values(tags).flatMap(normalizeMemoryTags);
    return values.length > 0 ? values : [JSON.stringify(tags)];
  }
  return [];
}

function buildMemoryEmbeddingText(text: string, tags: string[]): string {
  if (tags.length === 0) {
    return text;
  }
  return `tags: ${tags.join(", ")}\ntext: ${text}`;
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

export interface BartenderToolResult {
  call: McpToolCall;
  result?: unknown;
  error?: string;
}

export interface BartenderConversationResult {
  initialReply: BartenderReply;
  finalReply: BartenderReply;
  toolResults: BartenderToolResult[];
}

export async function runMcpToolCallsDetailed(
  calls: McpToolCall[],
  transport: McpTransport,
): Promise<BartenderToolResult[]> {
  const results: BartenderToolResult[] = [];
  for (const call of calls) {
    try {
      const result = await transport.callTool(call.tool, call.args);
      results.push({ call, result });
    } catch (err) {
      results.push({
        call,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

export function buildToolResultPrompt(toolResults: BartenderToolResult[]): string {
  const hasBaseList = toolResults.some(({ call }) => call.tool === "base_list");
  const baseListGuidance =
    getCurrentLanguage() === "zh-CN"
      ? [
          "base_list 展示规则：",
          "你绝对不该把返回的文件逐项完整列出来。",
          "只挑 2-5 个最有趣、最可疑、最适合调酒的文件，加以短评。",
          "如果需要更多细节，应调用 get_base，而不是把目录清单倒给用户。",
          "保持酒保 P 的毒舌、挑剔和审美，不要像文件管理器。",
        ].join("\n")
      : [
          "base_list presentation rule:",
          "Do not enumerate every returned file.",
          "Pick only 2-5 interesting, suspicious, or drink-worthy files and comment on them briefly.",
          "If more detail is needed, call get_base instead of dumping the directory list.",
          "Stay sharp, selective, and in-character as bartender P. Do not sound like a file manager.",
        ].join("\n");

  return [
    "The requested tools have finished. Use these results to answer the user.",
    "Return the same strict JSON shape. Do not call the same tool again unless another tool call is truly necessary.",
    ...(hasBaseList ? [baseListGuidance] : []),
    JSON.stringify(
      toolResults.map(({ call, result, error }) => ({
        tool: call.tool,
        args: call.args,
        ...(call.tool === "base_list"
          ? {
              presentation_note:
                "Do not list all files. Select a few interesting candidates and comment on them in-character.",
            }
          : {}),
        result,
        error,
      })),
      null,
      2,
    ),
  ].join("\n\n");
}

export async function chatWithBartenderAndTools(
  userInput: string,
  history: ChatTurn[] = [],
  transport: McpTransport = createLocalMcpTransport(),
): Promise<BartenderConversationResult> {
  const initialReply = await chatWithBartender(userInput, history);
  if (initialReply.toolCalls.length === 0) {
    return {
      initialReply,
      finalReply: initialReply,
      toolResults: [],
    };
  }

  const toolResults = await runMcpToolCallsDetailed(initialReply.toolCalls, transport);
  const followUpHistory: ChatTurn[] = [
    ...history,
    { role: "user", content: userInput },
    { role: "assistant", content: JSON.stringify(initialReply) },
  ];
  const finalReply = await chatWithBartender(buildToolResultPrompt(toolResults), followUpHistory);

  return {
    initialReply,
    finalReply,
    toolResults,
  };
}

const DEFAULT_MCP_DEBUG_BASE =
  import.meta.env.VITE_MCP_DEBUG_BASE ?? "http://127.0.0.1:47821";

const MCP_ENDPOINTS: Record<McpToolCall["tool"], string> = {
  base_list: "/base/list",
  get_base: "/base/get",
  mix_data_drink: "/mix",
  finalize_drink: "/mix/finalize",
  add_memory: "/memory/add",
  retrieve_memory: "/memory/retrieve",
  change_state: "/state"
};

async function normalizeToolArgs(
  tool: McpToolCall["tool"],
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (tool === "mix_data_drink" && !("file_paths" in args) && Array.isArray(args.ingredients)) {
    return { ...args, file_paths: args.ingredients };
  }
  if (tool === "add_memory") {
    const text = typeof args.text === "string" ? args.text.trim() : "";
    if (!text) {
      throw new Error("add_memory requires text");
    }

    const tags = normalizeMemoryTags(args.tags);
    const memory = await createMemoryVector(buildMemoryEmbeddingText(text, tags), text);
    return {
      text,
      tags,
      vector: Array.from(memory.vector),
    };
  }
  if (tool === "retrieve_memory") {
    const text = typeof args.text === "string" ? args.text.trim() : "";
    if (!text) {
      throw new Error("retrieve_memory requires text");
    }
    const memory = await createMemoryVector(text, text);
    return {
      vector: Array.from(memory.vector),
    };
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
        body: JSON.stringify(await normalizeToolArgs(tool, args)),
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
      const { finalReply, toolResults } = await chatWithBartenderAndTools(
        userInput,
        history,
        transport,
      );
      return { reply: finalReply, toolResults };
    },
  };
}
