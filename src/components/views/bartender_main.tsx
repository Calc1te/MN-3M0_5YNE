import { useEffect, useRef, useState } from "react";
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
  buildDefaultAppConfig,
  getAppConfig,
  type AppConfig,
} from "@/lib/app-config";
import {
  getBartenderHistory,
  setBartenderHistory,
} from "@/lib/bartender-history";
import { ghostModeRegionProps } from "@/lib/ghost-mode";
import { cn } from "@/lib/utils";
import {
  changeBartenderState,
  isBartenderState,
} from "@/uiControllers/bartender";
import { setIdleTriggerState } from "@/uiControllers/idle-trigger";

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
  const [config, setConfig] = useState<AppConfig>(() => buildDefaultAppConfig());
  const [reply, setReply] = useState("");
  const [toolStatus, setToolStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef(history);
  const isLoadingRef = useRef(isLoading);
  const configRef = useRef(config);
  const idleTimerRef = useRef<number | null>(null);
  const idleCountdownRef = useRef<number | null>(null);
  const idleDeadlineRef = useRef<number | null>(null);
  const idleRunRef = useRef(false);

  // Get the latest message from history or current reply
  const displayedMessage = reply || (history.length > 0 && history[history.length - 1]?.role === "assistant" ? history[history.length - 1].content : "");

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    void getAppConfig()
      .then((loadedConfig) => {
        setConfig(loadedConfig);
      })
      .catch((loadError: unknown) => {
        console.warn("Failed to load bartender config:", loadError);
      });
  }, []);

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

  const clearIdleTimer = () => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (idleCountdownRef.current !== null) {
      window.clearInterval(idleCountdownRef.current);
      idleCountdownRef.current = null;
    }
    idleDeadlineRef.current = null;
    setIdleTriggerState({
      enabled: false,
      running: idleRunRef.current,
      remainingMs: 0,
    });
  };

  const resetIdleTimer = () => {
    clearIdleTimer();

    const timeoutMinutes = configRef.current.Idle_Auto_Mix_Minutes;
    if (
      timeoutMinutes <= 0 ||
      isLoadingRef.current ||
      idleRunRef.current
    ) {
      setIdleTriggerState({
        enabled: timeoutMinutes > 0,
        running: idleRunRef.current,
        remainingMs: 0,
      });
      return;
    }

    const timeoutMs = timeoutMinutes * 60 * 1000;
    idleDeadlineRef.current = Date.now() + timeoutMs;
    setIdleTriggerState({
      enabled: true,
      running: false,
      remainingMs: timeoutMs,
    });

    idleCountdownRef.current = window.setInterval(() => {
      const deadline = idleDeadlineRef.current;
      const remainingMs = deadline ? Math.max(0, deadline - Date.now()) : 0;
      setIdleTriggerState({
        enabled: true,
        running: false,
        remainingMs,
      });
    }, 1000);

    idleTimerRef.current = window.setTimeout(() => {
      void handleIdleTrigger();
    }, timeoutMs);
  };

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

  const runConversation = async (
    prompt: string,
    options: {
      persistUserInput: boolean;
      clearInputAfterReply: boolean;
      automatic: boolean;
    },
  ) => {
    const baseHistory = historyRef.current;
    clearIdleTimer();
    setIsLoading(true);
    isLoadingRef.current = true;
    setIsSpeaking(true);
    setError(null);
    setToolStatus("");
    setReply("");

    try {
      const response = await chatWithBartenderStream(
        prompt,
        baseHistory,
        setReply,
      );
      const hasToolCalls = response.toolCalls.length > 0;

      setReply(response.assistant);
      setIsSpeaking(false);
      if (options.clearInputAfterReply) {
        setInput("");
      }

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
          ...baseHistory,
          ...(options.persistUserInput
            ? [{ role: "user" as const, content: prompt }]
            : []),
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

        const nextHistory = options.persistUserInput
          ? [
              ...baseHistory,
              { role: "user" as const, content: prompt },
              { role: "assistant" as const, content: finalReply.assistant },
            ]
          : [
              ...baseHistory,
              { role: "assistant" as const, content: finalReply.assistant },
            ];
        setBartenderHistory(nextHistory);
        setHistory(nextHistory);
        return;
      }

      const newHistory: ChatTurn[] = options.persistUserInput
        ? [
            ...baseHistory,
            { role: "user", content: prompt },
            {
              role: "assistant",
              content: response.assistant,
            },
          ]
        : [
            ...baseHistory,
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
      if (options.automatic) {
        idleRunRef.current = false;
      }
      setIsSpeaking(false);
      setIsLoading(false);
      isLoadingRef.current = false;
      resetIdleTimer();
    }
  };

  const handleIdleTrigger = async () => {
    if (isLoadingRef.current || idleRunRef.current) {
      return;
    }

    idleRunRef.current = true;
    setIdleTriggerState({
      enabled: configRef.current.Idle_Auto_Mix_Minutes > 0,
      running: true,
      remainingMs: 0,
    });
    await runConversation(t("prompts.idle_trigger"), {
      persistUserInput: false,
      clearInputAfterReply: false,
      automatic: true,
    });
  };

  const handleSendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    await runConversation(trimmed, {
      persistUserInput: true,
      clearInputAfterReply: true,
      automatic: false,
    });
  };

  useEffect(() => {
    resetIdleTimer();

    const markActivity = () => {
      resetIdleTimer();
    };

    window.addEventListener("pointerdown", markActivity);
    window.addEventListener("keydown", markActivity);
    window.addEventListener("focus", markActivity);

    return () => {
      clearIdleTimer();
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("focus", markActivity);
    };
  }, [config.Idle_Auto_Mix_Minutes, history.length]);

  return (
    <section
      className={cn(
        "fixed right-4 bottom-4 z-20 flex w-[min(24rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] flex-col items-end justify-end gap-3 text-background",
        isZh && "font-ui-cn",
      )}
    >
      <PDialog
        containerProps={ghostModeRegionProps}
        value={displayedMessage}
        readOnly
        isSpeaking={isSpeaking}
        typingSpeed={config.Dialog_Typing_Speed}
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
        buttonClassName={cn("w-20 h-8 text-white", !isZh && "text-[9px]")} // why english font so big bruh
        className="w-full justify-end"
        inputClassName={cn(
          "bg-foreground text-background placeholder:text-background/60",
          chatFontClass,
        )}
        inputProps={{ font: "normal" }}
        buttonProps={isZh ? { font: "normal" } : undefined}
      />
    </section>
  );
}
