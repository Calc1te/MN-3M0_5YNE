import type { ChatTurn } from "@/api_caller";

let bartenderHistory: ChatTurn[] = [];

export function getBartenderHistory(): ChatTurn[] {
  return [...bartenderHistory];
}

export function setBartenderHistory(history: ChatTurn[]): ChatTurn[] {
  bartenderHistory = [...history];
  return getBartenderHistory();
}

export function clearBartenderHistory(): void {
  bartenderHistory = [];
}
