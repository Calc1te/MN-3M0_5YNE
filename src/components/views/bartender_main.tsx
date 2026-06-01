import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  buildToolResultPrompt,
  chatWithBartenderStream,
  createLocalMcpTransport,
  runMcpToolCallsDetailed,
  type BartenderToolResult,
  type ChatTurn,
} from "@/api_caller";
import PDialog from "@/components/P_dialog";
import PSprite from "@/components/P_sprite";
import UserInput from "@/components/user_input";
import {
  clearBartenderHistory,
  getBartenderHistory,
  setBartenderHistory,
} from "@/lib/bartender-history";
import { ghostModeRegionProps } from "@/lib/ghost-mode";
import { cn } from "@/lib/utils";
import {
  changeBartenderState,
  isBartenderState,
} from "@/uiControllers/bartender";

interface BartenderMainProps {
  showSetupCompletePrompt?: boolean;
  onSetupCompletePromptShown?: () => void;
}

export default function BartenderMain({
  showSetupCompletePrompt = false,
  onSetupCompletePromptShown,
}: BartenderMainProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isZh = Boolean(language && language.startsWith("zh"));
  const chatFontClass = isZh ? "font-chat-cn" : "font-chat-en";
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<ChatTurn[]>(() =>
    getBartenderHistory(),
  );
  const [reply, setReply] = useState("");
  const [toolStatus, setToolStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showSetupCompletePrompt) {
      return;
    }

    setReply(t("prompts.setup_complete"));
    setToolStatus("");
    setError(null);
    setIsSpeaking(false);
    onSetupCompletePromptShown?.();
  }, [onSetupCompletePromptShown, showSetupCompletePrompt, t]);

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
      const mapped =
        normalized === "smoling"
          ? "smoking"
          : normalized === "lookingatyou"
            ? "lookingAtYou"
            : normalized;
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
    setIsSpeaking(true);
    setError(null);
    setToolStatus("");
    setReply("");

    try {
      const response = await chatWithBartenderStream(trimmed, history, setReply);
      const hasToolCalls = response.toolCalls.length > 0;

      setReply(response.assistant);
      setIsSpeaking(false);
      setInput("");

      if (hasToolCalls) {
        setToolStatus(
          t("ui.toolCalling") || "P is rummaging through the file pile...",
        );
        const toolResults = await runMcpToolCallsDetailed(
          response.toolCalls,
          createLocalMcpTransport(),
        );
        applyToolStateChanges(toolResults);

        const followUpHistory: ChatTurn[] = [
          ...history,
          { role: "user", content: trimmed },
          { role: "assistant", content: JSON.stringify(response) },
        ];
        setReply("");
        setIsSpeaking(true);
        const finalReply = await chatWithBartenderStream(
          buildToolResultPrompt(toolResults),
          followUpHistory,
          setReply,
        );

        setToolStatus("");
        setReply(finalReply.assistant);
        setIsSpeaking(false);

        setBartenderHistory([
          ...history,
          { role: "user", content: trimmed },
          { role: "assistant", content: finalReply.assistant },
        ]);
        setHistory(getBartenderHistory());
        return;
      }

      const newHistory: ChatTurn[] = [
        ...history,
        { role: "user", content: trimmed },
        {
          role: "assistant",
          content: response.assistant,
        },
      ];
      setBartenderHistory(newHistory);
      setHistory(newHistory);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      console.error("API call failed:", err);
    } finally {
      setIsSpeaking(false);
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    clearBartenderHistory();
    setHistory([]);
    setInput("");
    setReply("");
    setToolStatus("");
    setIsSpeaking(false);
    setError(null);
  };

  return (
    <section
      className={cn(
        "fixed right-4 bottom-4 z-20 flex w-[min(24rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] flex-col items-end justify-end gap-3 text-background",
        isZh && "font-ui-cn",
      )}
    >
      <PDialog
        containerProps={ghostModeRegionProps}
        value={reply}
        readOnly
        isSpeaking={isSpeaking}
        font="normal"
        rows={6}
        containerClassName="w-full"
        className={cn(
          "w-full bg-foreground text-background placeholder:text-background/60",
          chatFontClass,
        )}
      />
      {toolStatus && (
        <div
          className={cn(
            "w-full text-right text-xs text-foreground/70",
            chatFontClass,
          )}
        >
          {toolStatus}
        </div>
      )}
      <PSprite
        className="p-sprite-container self-end"
        data-tauri-drag-region
        {...ghostModeRegionProps}
      />

      {error && (
        <div
          className="w-full p-2 bg-destructive/20 text-destructive text-sm rounded"
        >
          {error}
        </div>
      )}

      <UserInput
        {...ghostModeRegionProps}
        value={input}
        onChange={setInput}
        onSubmit={() => void handleSendMessage()}
        placeholder={t("ui.inputPlaceholder") || "Enter message..."}
        disabled={isLoading}
        buttonLabel={isLoading ? t("utils.sending") : t("utils.send")}
        buttonClassName="w-20 h-8 text-white"
        className="w-full justify-end"
        inputClassName={cn(
          "bg-foreground text-background placeholder:text-background/60",
          chatFontClass,
        )}
        inputProps={{ font: "normal" }}
        buttonProps={isZh ? { font: "normal" } : undefined}
      />
      <div className="flex w-fit justify-end">
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
