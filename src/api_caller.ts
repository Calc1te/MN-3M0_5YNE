import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions/completions";
import { invoke } from "@tauri-apps/api/core";
import i18n, { getCurrentLanguage } from "./i18n";
import { getRuntimeApiKey } from "@/lib/api-key";
import {
  getRuntimeLlmConfig,
  type RuntimeLlmConfig,
} from "@/lib/app-config";

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

function createOpenAiClient(apiKey: string, baseUrl: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: normalizeChatCompletionsBaseUrl(baseUrl),
    dangerouslyAllowBrowser: true,
  });
}

interface ArkMultimodalEmbeddingResponse {
  embedding?: number[];
  data?: {
    embedding?: number[];
  } | Array<{
    embedding?: number[];
  }>;
  error?: {
    message?: string;
  };
}

function buildEmbeddingUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed;
}

function getEmbeddingFromPayload(
  payload: ArkMultimodalEmbeddingResponse,
): number[] | undefined {
  if (Array.isArray(payload.embedding)) {
    return payload.embedding;
  }
  if (Array.isArray(payload.data)) {
    return payload.data[0]?.embedding;
  }
  return payload.data?.embedding;
}

async function parseEmbeddingResponse(
  response: Response,
): Promise<ArkMultimodalEmbeddingResponse> {
  const responseText = await response.text();
  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText) as ArkMultimodalEmbeddingResponse;
  } catch {
    if (!response.ok) {
      throw new Error(responseText);
    }
    throw new Error("Embedding service returned non-JSON response");
  }
}

async function resolveLlmConfig(
  configOverride?: RuntimeLlmConfig,
): Promise<RuntimeLlmConfig> {
  if (configOverride) {
    return configOverride;
  }
  return getRuntimeLlmConfig();
}

function getSystemPrompt(): string {
  const language = getCurrentLanguage();
  return i18n.getFixedT(language)("prompts.system");
}

interface StartupContext {
  Name?: string;
  Last_Activated?: number;
  Base_Dir?: string;
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
  const config = await resolveLlmConfig();
  if (!config.chatBaseUrl) {
    throw new Error("Missing VITE_BARTENDER_URL");
  }

  const apiKey = config.apiKey || (await getRuntimeApiKey());
  if (!apiKey) {
    throw new Error(i18n.t("errors.missingApiKey"));
  }

  const model = config.chatModel;
  if (!model) {
    throw new Error("Missing VITE_ARK_ENDPOINT_ID");
  }

  const openai = createOpenAiClient(apiKey, config.chatBaseUrl);
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
  const config = await resolveLlmConfig();
  if (!config.chatBaseUrl) {
    throw new Error("Missing VITE_BARTENDER_URL");
  }

  const apiKey = config.apiKey || (await getRuntimeApiKey());
  if (!apiKey) {
    throw new Error(i18n.t("errors.missingApiKey"));
  }

  const model = config.chatModel;
  if (!model) {
    throw new Error("Missing VITE_ARK_ENDPOINT_ID");
  }

  const openai = createOpenAiClient(apiKey, config.chatBaseUrl);
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
  const config = await resolveLlmConfig();
  const apiKey = config.apiKey || (await getRuntimeApiKey());
  if (!apiKey) {
    throw new Error(i18n.t("errors.missingApiKey"));
  }

  const model = config.embeddingModel;
  if (!model) {
    throw new Error("Missing VITE_EMBD_MODEL");
  }
  if (!config.embeddingBaseUrl) {
    throw new Error("Missing VITE_EMBD_URL");
  }

  const response = await fetch(buildEmbeddingUrl(config.embeddingBaseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: memoryText,
    }),
  });

  const payload = await parseEmbeddingResponse(response);
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `Embedding request failed: ${response.status}`,
    );
  }

  const embedding = getEmbeddingFromPayload(payload);
  if (!Array.isArray(embedding)) {
    throw new Error("Embedding response did not include data.embedding");
  }

  return {
    vector: Float32Array.from(embedding),
    content: memoryContent,
  };
}

export async function summarizeExitMemory(context: {
  language: string;
  baseDir?: string;
  barRootParent?: string;
  history?: ChatTurn[];
}): Promise<string> {
  const config = await resolveLlmConfig();
  if (!config.chatBaseUrl) {
    throw new Error("Missing VITE_BARTENDER_URL");
  }
  if (!config.chatModel) {
    throw new Error("Missing VITE_ARK_ENDPOINT_ID");
  }
  if (!config.apiKey) {
    throw new Error(i18n.t("errors.missingApiKey"));
  }

  const language = getCurrentLanguage();
  const t = i18n.getFixedT(language);
  const history = (context.history ?? []);
  const openai = createOpenAiClient(config.apiKey, config.chatBaseUrl);
  const completion = await openai.chat.completions.create({
    model: config.chatModel,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: t("prompts.exitMemorySystem"),
      },
      {
        role: "user",
        content: JSON.stringify({
          language: context.language,
          baseDir: context.baseDir,
          barRootParent: context.barRootParent,
          exitedAt: new Date().toISOString(),
          recentConversation: history,
        }),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(i18n.t("errors.emptyModelResponse"));
  }
  return content;
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

export async function checkChatModelConnection(
  configOverride?: RuntimeLlmConfig,
): Promise<void> {
  const config = await resolveLlmConfig(configOverride);
  if (!config.chatBaseUrl) {
    throw new Error("Missing VITE_BARTENDER_URL");
  }

  const apiKey = config.apiKey || (await getRuntimeApiKey());
  if (!apiKey) {
    throw new Error(i18n.t("errors.missingApiKey"));
  }

  if (!config.chatModel) {
    throw new Error("Missing VITE_ARK_ENDPOINT_ID");
  }

  const openai = createOpenAiClient(apiKey, config.chatBaseUrl);
  const completion = await openai.chat.completions.create({
    model: config.chatModel,
    temperature: 0,
    messages: await toChatMessages([], "ping"),
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error(i18n.t("errors.emptyModelResponse"));
  }
}

export async function checkEmbeddingModelConnection(
  configOverride?: RuntimeLlmConfig,
): Promise<void> {
  const config = await resolveLlmConfig(configOverride);
  const apiKey = config.apiKey || (await getRuntimeApiKey());
  if (!apiKey) {
    throw new Error(i18n.t("errors.missingApiKey"));
  }

  if (!config.embeddingModel) {
    throw new Error("Missing VITE_EMBD_MODEL");
  }
  if (!config.embeddingBaseUrl) {
    throw new Error("Missing VITE_EMBD_URL");
  }

  const response = await fetch(buildEmbeddingUrl(config.embeddingBaseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input: "ping",
    }),
  });

  const payload = await parseEmbeddingResponse(response);
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `Embedding request failed: ${response.status}`,
    );
  }

  if (!Array.isArray(getEmbeddingFromPayload(payload))) {
    throw new Error("Embedding response did not include data.embedding");
  }
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
    // change_state is a frontend-only tool, don't send it to the backend
    if (call.tool === "change_state") {
      results.push({ call, result: { state: call.args.state } });
      continue;
    }

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
  const language = getCurrentLanguage();
  const t = i18n.getFixedT(language);
  const hasBaseList = toolResults.some(({ call }) => call.tool === "base_list");
  const baseListGuidance = (
    t("prompts.baseListGuidance", {
      returnObjects: true,
    }) as string[]
  ).join("\n");
  const baseListPresentationNote = t("prompts.baseListPresentationNote");

  return [
    t("prompts.toolResultsFinished"),
    t("prompts.toolResultsReuseJson"),
    ...(hasBaseList ? [baseListGuidance] : []),
    JSON.stringify(
      toolResults.map(({ call, result, error }) => ({
        tool: call.tool,
        args: call.args,
        ...(call.tool === "base_list"
          ? {
              presentation_note: baseListPresentationNote,
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
