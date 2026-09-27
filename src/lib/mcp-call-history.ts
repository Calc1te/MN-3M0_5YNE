import type { McpToolCall } from "@/api_caller";

export type McpCallHistoryEntry = {
  id: string;
  tool: McpToolCall["tool"];
  args: Record<string, unknown>;
  startedAt: number;
  finishedAt?: number;
  result?: unknown;
  error?: string;
};

type Listener = (entries: McpCallHistoryEntry[]) => void;

const MAX_HISTORY_ENTRIES = 50;
const listeners = new Set<Listener>();
let entries: McpCallHistoryEntry[] = [];

function emit() {
  const snapshot = getMcpCallHistory();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function getMcpCallHistory(): McpCallHistoryEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

export function onMcpCallHistoryChange(listener: Listener): () => void {
  listeners.add(listener);
  listener(getMcpCallHistory());
  return () => {
    listeners.delete(listener);
  };
}

export function clearMcpCallHistory(): void {
  entries = [];
  emit();
}

export function recordMcpCallStart(call: McpToolCall): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  entries = [
    {
      id,
      tool: call.tool,
      args: call.args,
      startedAt: Date.now(),
    },
    ...entries,
  ].slice(0, MAX_HISTORY_ENTRIES);
  emit();
  return id;
}

export function recordMcpCallFinish(
  id: string,
  payload: { result?: unknown; error?: string },
): void {
  entries = entries.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          finishedAt: Date.now(),
          ...payload,
        }
      : entry,
  );
  emit();
}
