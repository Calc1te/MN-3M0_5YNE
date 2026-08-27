import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  MAX_BARTENDER_TOOL_ROUNDS,
  buildToolLoopLimitPrompt,
  buildToolResultPrompt,
  chatWithBartenderStream,
  createLocalMcpTransport,
  filterToolCallsForRound,
  rememberSuccessfulToolCalls,
  runMcpToolCallsDetailed,
  type BartenderToolResult,
  type ChatTurn,
  type McpToolCall,
} from "@/api_caller";
import PDialog from "@/components/P_dialog";
import PFileDropTarget from "@/components/P_file_drop_target";
import type { DrinkActionEvent } from "@/components/bar_counter_drink_menu";
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
import {
  getChatFontClass,
  getUIFontClass,
  usesPixelUiFont,
} from "@/lib/language";
import { cn } from "@/lib/utils";
import {
  changeBartenderState,
  isBartenderState,
} from "@/uiControllers/bartender";
import {
  clearBarCounterDrink,
  showBarCounterDrink,
} from "@/uiControllers/bar-counter-drink";
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
  const uiFontClass = getUIFontClass(language);
  const chatFontClass = getChatFontClass(language);
  const usesPixelFont = usesPixelUiFont(language);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<ChatTurn[]>(() =>
    getBartenderHistory(),
  );
  const [config, setConfig] = useState<AppConfig>(() => buildDefaultAppConfig());
  const [reply, setReply] = useState("");
  const [toolStatus, setToolStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isReplyComplete, setIsReplyComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef(history);
  const isLoadingRef = useRef(isLoading);
  const configRef = useRef(config);
  const idleTimerRef = useRef<number | null>(null);
  const idleCountdownRef = useRef<number | null>(null);
  const idleDeadlineRef = useRef<number | null>(null);
  const idleRunRef = useRef(false);
  const retainedToolReplyTimeoutRef = useRef<number | null>(null);
  const activeConversationRef = useRef<{
    controller: AbortController;
    restoreInput: string | null;
  } | null>(null);

  // While a response is streaming, only display the current reply. Falling back
  // to history here would replay the previous answer before new text arrives.
  const latestAssistantMessage =
    history.length > 0 && history[history.length - 1]?.role === "assistant"
      ? history[history.length - 1].content
      : "";
  const displayedMessage = isSpeaking ? reply : reply || latestAssistantMessage;

  const handleDialogTypingComplete = useCallback(() => {
    setIsSpeaking(false);
  }, []);

  const handleDrinkActionError = useCallback((message: string) => {
    setError(message || null);
  }, []);

  const clearRetainedToolReplyTimeout = () => {
    if (retainedToolReplyTimeoutRef.current !== null) {
      window.clearTimeout(retainedToolReplyTimeoutRef.current);
      retainedToolReplyTimeoutRef.current = null;
    }
  };

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

    clearRetainedToolReplyTimeout();
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
    for (const { call, result, error } of toolResults) {
      if (error) {
        continue;
      }

      if (call.tool === "mix_data_drink") {
        const drinkId =
          typeof result === "object" &&
          result !== null &&
          "drink_id" in result &&
          typeof (result as { drink_id?: unknown }).drink_id === "string"
            ? (result as { drink_id: string }).drink_id
            : null;
        if (drinkId) {
          showBarCounterDrink(drinkId);
        } else {
          console.warn("MCP mix_data_drink did not return a drink_id.");
        }
        continue;
      }

      if (call.tool === "finalize_drink") {
        const drinkId =
          typeof result === "object" &&
          result !== null &&
          "drink_id" in result &&
          typeof (result as { drink_id?: unknown }).drink_id === "string"
            ? (result as { drink_id: string }).drink_id
            : typeof call.args.drink_id === "string"
              ? call.args.drink_id
              : undefined;
        clearBarCounterDrink(drinkId);
        continue;
      }

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
      restoreInputOnCancel: boolean;
      persistedUserContent?: string;
      allowedTools?: McpToolCall["tool"][];
    },
  ) => {
    if (activeConversationRef.current) {
      return;
    }

    const controller = new AbortController();
    activeConversationRef.current = {
      controller,
      restoreInput: options.restoreInputOnCancel ? prompt : null,
    };
    let waitForDialogTyping = false;
    const baseHistory = historyRef.current;
    clearIdleTimer();
    clearRetainedToolReplyTimeout();
    setIsLoading(true);
    isLoadingRef.current = true;
    setIsSpeaking(true);
    setIsReplyComplete(false);
    setError(null);
    setToolStatus("");
    setReply("");

    try {
      const applyToolPolicy = (response: Awaited<ReturnType<typeof chatWithBartenderStream>>) => {
        if (!options.allowedTools) {
          return response;
        }
        const allowedTools = new Set(options.allowedTools);
        return {
          ...response,
          toolCalls: response.toolCalls.filter((call) =>
            allowedTools.has(call.tool),
          ),
        };
      };

      let response = applyToolPolicy(await chatWithBartenderStream(
        prompt,
        baseHistory,
        setReply,
        controller.signal,
      ));
      const hasToolCalls = response.toolCalls.length > 0;

      if (options.clearInputAfterReply) {
        setInput("");
      }

      if (hasToolCalls) {
        setReply(response.assistant);
        setIsReplyComplete(true);
        setToolStatus(
          t("ui.toolCalling") || "P is rummaging through the file pile...",
        );
        retainedToolReplyTimeoutRef.current = window.setTimeout(() => {
          setReply((currentReply) =>
            currentReply === response.assistant ? "" : currentReply,
          );
          retainedToolReplyTimeoutRef.current = null;
        }, 30_000);

        let followUpHistory: ChatTurn[] = [
          ...baseHistory,
          { role: "user", content: prompt },
        ];
        const completedToolSignatures = new Set<string>();
        const transport = createLocalMcpTransport();

        for (
          let round = 0;
          response.toolCalls.length > 0 && round < MAX_BARTENDER_TOOL_ROUNDS;
          round += 1
        ) {
          followUpHistory = [
            ...followUpHistory,
            { role: "assistant", content: JSON.stringify(response) },
          ];
          const { pendingCalls, filteredResults } = filterToolCallsForRound(
            response.toolCalls,
            completedToolSignatures,
          );
          const toolResults = [
            ...(pendingCalls.length > 0
              ? await runMcpToolCallsDetailed(
                  pendingCalls,
                  transport,
                  controller.signal,
                )
              : []),
            ...filteredResults,
          ];
          rememberSuccessfulToolCalls(toolResults, completedToolSignatures);
          applyToolStateChanges(toolResults);

          const resultPrompt = buildToolResultPrompt(toolResults);
          setIsReplyComplete(false);
          setIsSpeaking(true);
          response = applyToolPolicy(await chatWithBartenderStream(
            resultPrompt,
            followUpHistory,
            (text) => {
              if (!text.trim()) {
                return;
              }
              clearRetainedToolReplyTimeout();
              setReply(text);
            },
            controller.signal,
          ));
          followUpHistory = [
            ...followUpHistory,
            { role: "user", content: resultPrompt },
          ];
        }

        if (response.toolCalls.length > 0) {
          followUpHistory = [
            ...followUpHistory,
            { role: "assistant", content: JSON.stringify(response) },
          ];
          response = applyToolPolicy(await chatWithBartenderStream(
            buildToolLoopLimitPrompt(),
            followUpHistory,
            (text) => {
              if (text.trim()) {
                clearRetainedToolReplyTimeout();
                setReply(text);
              }
            },
            controller.signal,
          ));
        }

        clearRetainedToolReplyTimeout();
        setToolStatus("");
        setReply(response.assistant);
        setIsReplyComplete(true);
        waitForDialogTyping = true;

        const persistedUserContent = options.persistedUserContent ?? prompt;
        const nextHistory = options.persistUserInput
          ? [
              ...baseHistory,
              { role: "user" as const, content: persistedUserContent },
              { role: "assistant" as const, content: response.assistant },
            ]
          : [
              ...baseHistory,
              { role: "assistant" as const, content: response.assistant },
            ];
        setBartenderHistory(nextHistory);
        setHistory(nextHistory);
        return;
      }

      setReply(response.assistant);
      setIsReplyComplete(true);
      waitForDialogTyping = true;

      const persistedUserContent = options.persistedUserContent ?? prompt;
      const newHistory: ChatTurn[] = options.persistUserInput
        ? [
            ...baseHistory,
            { role: "user", content: persistedUserContent },
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
      if (controller.signal.aborted) {
        clearRetainedToolReplyTimeout();
        setReply("");
        setToolStatus("");
        setError(null);
        setIsSpeaking(false);
        setIsReplyComplete(false);
        return;
      }
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      console.error("API call failed:", err);
    } finally {
      if (options.automatic) {
        idleRunRef.current = false;
      }
      if (!waitForDialogTyping) {
        setIsSpeaking(false);
      }
      if (activeConversationRef.current?.controller === controller) {
        activeConversationRef.current = null;
        setIsLoading(false);
        isLoadingRef.current = false;
        resetIdleTimer();
      }
    }
  };

  const handleCancelConversation = () => {
    const activeConversation = activeConversationRef.current;
    if (!activeConversation) {
      return;
    }

    if (activeConversation.restoreInput !== null) {
      setInput(activeConversation.restoreInput);
    }
    clearRetainedToolReplyTimeout();
    setReply("");
    setToolStatus("");
    setError(null);
    setIsSpeaking(false);
    setIsReplyComplete(false);
    activeConversation.controller.abort();
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
    await runConversation(
      `${t("prompts.idle_trigger")}\n\n${t("prompts.idleWorkflow")}`,
      {
        persistUserInput: false,
        clearInputAfterReply: false,
        automatic: true,
        restoreInputOnCancel: false,
      },
    );
  };

  const handleSendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    await runConversation(trimmed, {
      persistUserInput: true,
      clearInputAfterReply: true,
      automatic: false,
      restoreInputOnCancel: true,
    });
  };

  const handleDroppedFiles = async (paths: string[]) => {
    if (isLoadingRef.current) {
      return;
    }

    const uniquePaths = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
    if (uniquePaths.length === 0) {
      return;
    }

    await runConversation(
      t("prompts.fileDrop", {
        count: uniquePaths.length,
        paths: JSON.stringify(uniquePaths, null, 2),
      }),
      {
        persistUserInput: true,
        clearInputAfterReply: false,
        automatic: false,
        restoreInputOnCancel: false,
      },
    );
  };

  const handleDrinkActionComplete = ({
    drinkName,
    action,
  }: DrinkActionEvent) => {
    const actionText = t(
      action === "drink"
        ? "ui.drinkActionHistoryDrink"
        : "ui.drinkActionHistoryRestore",
      { drink: drinkName },
    );
    void runConversation(
      t("prompts.drinkAction", {
        action: t(
          action === "drink" ? "ui.drinkMenuDrink" : "ui.drinkMenuRestore",
        ),
        drink: drinkName,
      }),
      {
        persistUserInput: true,
        persistedUserContent: actionText,
        clearInputAfterReply: false,
        automatic: false,
        restoreInputOnCancel: false,
        allowedTools: ["change_state"],
      },
    );
  };

  useEffect(() => {
    return () => {
      activeConversationRef.current?.controller.abort();
    };
  }, []);

  useEffect(() => {
    resetIdleTimer();

    const markActivity = () => {
      resetIdleTimer();
    };

    window.addEventListener("pointerdown", markActivity);
    window.addEventListener("keydown", markActivity);
    window.addEventListener("focus", markActivity);

    return () => {
      clearRetainedToolReplyTimeout();
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
        uiFontClass,
      )}
    >
      <PDialog
        containerProps={ghostModeRegionProps}
        value={displayedMessage}
        readOnly
        isSpeaking={isSpeaking}
        isContentComplete={isReplyComplete}
        onTypingComplete={handleDialogTypingComplete}
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
      <PFileDropTarget
        disabled={isLoading}
        onFilesDropped={handleDroppedFiles}
        onDrinkActionError={handleDrinkActionError}
        onDrinkActionComplete={handleDrinkActionComplete}
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
        onCancel={handleCancelConversation}
        placeholder={t("ui.inputPlaceholder") || "Enter message..."}
        disabled={isLoading}
        buttonLabel={t("utils.send")}
        cancelLabel={t("utils.recall")}
        buttonClassName={cn("w-20 h-8 text-white", !usesPixelFont && "text-[9px]")}
        className="w-full justify-end"
        inputClassName={cn(
          "bg-foreground text-background placeholder:text-background/60",
          chatFontClass,
        )}
        inputProps={{ font: "normal" }}
        buttonProps={usesPixelFont ? { font: "normal" } : undefined}
      />
    </section>
  );
}
