import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  chatWithBartenderAndTools,
  type BartenderToolResult,
  type ChatTurn,
} from "@/api_caller";
import PDialog from "@/components/P_dialog";
import PSprite from "@/components/P_sprite";
import UserInput from "@/components/user_input";
import { cn } from "@/lib/utils";
import { changeBartenderState, isBartenderState } from "@/uiControllers/bartender";

export default function BartenderMain() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isZh = Boolean(language && language.startsWith("zh"));
  const chatFontClass = isZh ? "font-chat-cn" : "font-chat-en";
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [reply, setReply] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replyPlaceholder = useMemo(
    () => t("ui.noMessages") || "No messages yet",
    [t],
  );

  const applyToolStateChanges = (toolResults: BartenderToolResult[]) => {
    for (const { call, result } of toolResults) {
      if (call.tool !== "change_state") {
        continue;
      }

      const resultState =
        typeof result === "object" &&
        result !== null &&
        "state" in result &&
        typeof (result as { state?: unknown }).state === "string"
          ? String((result as { state?: unknown }).state)
          : null;
      const fallbackState =
        typeof call.args.state === "string" ? call.args.state : null;
      const rawState = resultState ?? fallbackState;
      if (!rawState) {
        console.warn("MCP change_state did not return a state.");
        continue;
      }

      const normalized = rawState.trim().toLowerCase();
      const mapped = normalized === "smoling" ? "smoking" : normalized;
      if (!isBartenderState(mapped)) {
        console.warn("Unknown bartender state from MCP:", rawState);
        continue;
      }
      changeBartenderState(mapped);
    }
  };

  const handleSendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await chatWithBartenderAndTools(trimmed, history);
      applyToolStateChanges(response.toolResults);

      const newHistory: ChatTurn[] = [
        ...history,
        { role: "user", content: trimmed },
        {
          role: "assistant",
          content: response.finalReply.assistant,
        },
      ];
      setHistory(newHistory);
      setReply(response.finalReply.assistant);
      setInput("");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      console.error("API call failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    setInput("");
    setReply("");
    setError(null);
  };

  return (
    <section
      className={cn(
        "w-full max-w-3xl ml-auto flex flex-col items-end gap-4",
        isZh && "font-ui-cn",
      )}
    >
            <PDialog
        value={reply}
        placeholder={replyPlaceholder}
        readOnly
        font="normal"
        rows={6}
        containerClassName="w-full max-w-2xl"
              className={cn("w-full", chatFontClass)}
      />
      <PSprite className="p-sprite-container" />


      {error && (
        <div className="w-full max-w-2xl p-2 bg-destructive/20 text-destructive text-sm rounded">
          {error}
        </div>
      )}

      <div className="flex w-full max-w-2xl gap-2 items-start justify-end">
        <UserInput
          value={input}
          onChange={setInput}
          onSubmit={() => void handleSendMessage()}
          placeholder={t("ui.inputPlaceholder") || "Enter message..."}
          disabled={isLoading}
          buttonLabel={isLoading ? t("utils.sending") : t("utils.send")}
          buttonClassName="w-20 h-8 text-white"
          className="flex-1"
          inputClassName={chatFontClass}
          inputProps={{ font: "normal" }}
          buttonProps={isZh ? { font: "normal" } : undefined}
        />
      </div>
      <div className="flex w-full max-w-2xl justify-end">
        <button
          onClick={handleClearHistory}
          className="px-3 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/90"
        >
          Clear
        </button>
      </div>
    </section>
  );
}
