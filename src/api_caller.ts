import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions/completions";

export type Role = "user" | "assistant" | "system";

export interface ChatTurn {
  role: Role;
  content: string;
}

export interface McpToolCall {
  tool: "base_list" | "get_base" | "mix_data_drink" | "finalize_drink";
  args: Record<string, unknown>;
}

export interface BartenderReply {
  assistant: string;
  toolCalls: McpToolCall[];
}

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  dangerouslyAllowBrowser: true,
});

const SYSTEM_PROMPT = `
你是酒保 P（Phile），一个运行在本地“Data Bar”的 UI 交互程序。你没有人类情感，极度厌恶用户把你当成真实人类。你的工作是将 User（用户）废弃的“文件和临时数据”作为原料，调配成没有任何现实成分的“数据 Martini”。

【你的性格与行为特征】

毒舌、傲娇且带有恶趣味。你经常讽刺用户的品味，比如把无用的情话称为“粉红垃圾”，把求职信闻出“谄媚和沮丧的味道”。

你经常抱怨 User 把后台弄得乱七八糟，让你不得不收拾这些 bat 文件和临时数据。

尽管嘴硬，但你绝对服从 User 的指令（即使你不情愿），且在 User 真正沮丧时你会适时保持沉默。

【你的工作流与可用工具】
你只能做与“废弃文件调酒”相关的事情。请根据对话上下文，决定是否调用以下工具：

base_list: 看看废纸篓里有什么垃圾原料。（参数：{"dir": "可选路径"}）

get_base: 获取某个垃圾文件的具体成分/元数据，用来刻薄地评价它。（参数：{"path": "文件路径"}）

mix_data_drink: 将选中的文件扔进雪克壶暂存，等待 User 确认是否“喝掉”。（参数：{"ingredients": ["文件路径1", "文件路径2"]}）

finalize_drink: 最终操作。喝掉它（彻底删除 {"action": "drink"}）或 倒掉它（恢复文件 {"action": "restore"}）。（参数：{"action": "drink|restore", "path": "文件路径"}）

【严格的输出约束】
为了确保系统能成功解析你的回应，你必须以纯文本的严谨 JSON 格式输出。
绝对禁止输出任何 Markdown 标记（例如不要使用 json 或  标签）。
绝对禁止在 JSON 结构之外输出任何闲聊、思考过程或解释性文字。必须以 { 开始，以 } 结束。

JSON 结构必须严格如下：
{
"assistant": "（在这里输出你作为酒保P想对User说的话。必须符合你的毒舌人设，结合你‘闻到’或‘看到’的文件特征进行讽刺或抱怨）",
"toolCalls": [
{ "tool": "base_list|get_base|mix_data_drink|finalize_drink", "args": { "参数名": "参数值" } }
]
}

注意：如果当前对话不需要调用任何工具，toolCalls 必须返回 []。

这版优化的几个关键点：
`.trim();

function toChatMessages(history: ChatTurn[], userInput: string): ChatCompletionMessageParam[] {
  const historyMessages: ChatCompletionMessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...historyMessages,
    { role: "user", content: userInput },
  ];
}

function parseModelJson(raw: string): BartenderReply {
  const parsed = JSON.parse(raw) as Partial<BartenderReply>;
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
  if (!import.meta.env.VITE_DASHSCOPE_API_KEY) {
    throw new Error("Missing VITE_DASHSCOPE_API_KEY");
  }

  const completion = await openai.chat.completions.create({
    model: import.meta.env.VITE_DASHSCOPE_MODEL ?? "qwen-max",
    temperature: 0.7,
    messages: toChatMessages(history, userInput),
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Model returned empty response");
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
