import {
  cursorPosition,
  currentMonitor,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Check, ClipboardCopy } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/8bit/select";
import {
  getGhostModeIgnoreState,
  ghostModeRegionProps,
  onGhostModeChange,
} from "@/lib/ghost-mode";
import { getBartenderHistory } from "@/lib/bartender-history";
import { getUIFontClass } from "@/lib/language";
import {
  clearMcpCallHistory,
  getMcpCallHistory,
  onMcpCallHistoryChange,
  type McpCallHistoryEntry,
} from "@/lib/mcp-call-history";
import { cn } from "@/lib/utils";
import {
  BARTENDER_STATES,
  changeBartenderState,
  getBartenderState,
  isBartenderState,
  onBartenderStateChange,
  type BartenderState,
} from "@/uiControllers/bartender";
import {
  getIdleTriggerState,
  onIdleTriggerStateChange,
  type IdleTriggerState,
} from "@/uiControllers/idle-trigger";

type DebugCoordinates = {
  screen: string;
  window: string;
  pointer: string;
};

type DebugStagedFile = {
  original_path: string;
  staged_path: string;
};

type DebugStagedDrink = {
  drink_id: string;
  staged_dir: string;
  staged_files: DebugStagedFile[];
  modified_unix_secs: number | null;
};

const isTauriApp =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const appWindow = isTauriApp ? getCurrentWindow() : null;
const UNAVAILABLE_COORDINATE = "—";

function formatCoordinates(x: number, y: number): string {
  return `${Math.round(x)}, ${Math.round(y)}`;
}

function getBrowserCoordinates(): DebugCoordinates {
  return {
    screen: `${window.screen.width} × ${window.screen.height}`,
    window: formatCoordinates(window.screenX, window.screenY),
    pointer: UNAVAILABLE_COORDINATE,
  };
}

function getBasename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function formatUnixSeconds(value: number | null): string {
  if (!value) {
    return UNAVAILABLE_COORDINATE;
  }
  return new Date(value * 1000).toLocaleTimeString();
}

function formatClockTime(value: number): string {
  return new Date(value).toLocaleTimeString();
}

function formatDuration(entry: McpCallHistoryEntry): string {
  if (!entry.finishedAt) {
    return "…";
  }
  return `${entry.finishedAt - entry.startedAt}ms`;
}

function formatJsonPreview(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2);
    if (!text) {
      return "";
    }
    return text.length > 800 ? `${text.slice(0, 800)}…` : text;
  } catch {
    return String(value);
  }
}

async function copyTextToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Some desktop webviews expose Clipboard API but reject it without a secure context.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy command was rejected");
    }
  } finally {
    textarea.remove();
  }
}

export default function DebugMenu() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const uiFontClass = getUIFontClass(language);
  const [state, setState] = useState<BartenderState>(() => getBartenderState());
  const [idleTrigger, setIdleTrigger] = useState<IdleTriggerState>(() =>
    getIdleTriggerState(),
  );
  const [isOpen, setIsOpen] = useState(false);
  const [coordinates, setCoordinates] = useState<DebugCoordinates>(() =>
    isTauriApp
      ? {
          screen: UNAVAILABLE_COORDINATE,
          window: UNAVAILABLE_COORDINATE,
          pointer: UNAVAILABLE_COORDINATE,
        }
      : getBrowserCoordinates(),
  );
  const [isClickEnabled, setIsClickEnabled] = useState<boolean | null>(() => {
    if (!isTauriApp) {
      return true;
    }

    const ignoreState = getGhostModeIgnoreState();
    return ignoreState === null ? null : !ignoreState;
  });
  const [stagedDrinks, setStagedDrinks] = useState<DebugStagedDrink[]>([]);
  const [stagedDrinksError, setStagedDrinksError] = useState<string | null>(
    null,
  );
  const [mcpCallHistory, setMcpCallHistory] = useState<McpCallHistoryEntry[]>(
    () => getMcpCallHistory(),
  );
  const [conversationCopyState, setConversationCopyState] = useState<
    "idle" | "copied" | "error"
  >("idle");

  useEffect(() => onBartenderStateChange(setState), []);
  useEffect(() => onIdleTriggerStateChange(setIdleTrigger), []);
  useEffect(() => onMcpCallHistoryChange(setMcpCallHistory), []);
  useEffect(
    () =>
      onGhostModeChange((ignore) => {
        setIsClickEnabled(ignore === null ? null : !ignore);
      }),
    [],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!appWindow) {
      const updateBrowserPointer = (event: MouseEvent) => {
        setCoordinates({
          ...getBrowserCoordinates(),
          pointer: formatCoordinates(event.screenX, event.screenY),
        });
      };

      window.addEventListener("mousemove", updateBrowserPointer);
      return () => {
        window.removeEventListener("mousemove", updateBrowserPointer);
      };
    }

    let isDisposed = false;
    const updateTauriCoordinates = () => {
      void Promise.all([
        currentMonitor(),
        appWindow.outerPosition(),
        cursorPosition(),
      ])
        .then(([monitor, windowPosition, pointerPosition]) => {
          if (isDisposed) {
            return;
          }

          setCoordinates({
            screen: monitor
              ? `${monitor.size.width} × ${monitor.size.height}`
              : UNAVAILABLE_COORDINATE,
            window: formatCoordinates(windowPosition.x, windowPosition.y),
            pointer: formatCoordinates(pointerPosition.x, pointerPosition.y),
          });
        })
        .catch((error: unknown) => {
          console.warn("Failed to load debug window coordinates:", error);
        });
    };

    updateTauriCoordinates();
    const intervalId = window.setInterval(updateTauriCoordinates, 250);
    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isTauriApp) {
      return;
    }

    let isDisposed = false;
    const updateStagedDrinks = () => {
      void invoke<DebugStagedDrink[]>("debug_staged_drinks")
        .then((drinks) => {
          if (isDisposed) {
            return;
          }
          setStagedDrinks(drinks);
          setStagedDrinksError(null);
        })
        .catch((error: unknown) => {
          if (isDisposed) {
            return;
          }
          setStagedDrinksError(String(error));
        });
    };

    updateStagedDrinks();
    const intervalId = window.setInterval(updateStagedDrinks, 1000);
    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, [isOpen]);

  const handleStateChange = (value: string) => {
    if (!isBartenderState(value)) {
      return;
    }
    setState(changeBartenderState(value));
  };

  const handleCopyConversation = async () => {
    try {
      const conversation = JSON.stringify(getBartenderHistory(), null, 2);
      await copyTextToClipboard(conversation);
      setConversationCopyState("copied");
    } catch (error) {
      console.warn("Failed to copy conversation history:", error);
      setConversationCopyState("error");
    }
  };

  const countdownText = idleTrigger.running
    ? t("ui.debugIdleCountdownRunning")
    : !idleTrigger.enabled
      ? t("ui.debugIdleCountdownDisabled")
      : `${Math.floor(idleTrigger.remainingMs / 1000)}s`;

  return (
    <details
      {...ghostModeRegionProps}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className={cn(
        "w-full max-w-3xl mx-auto mt-6 border border-border rounded-lg bg-card p-4",
        uiFontClass,
      )}
    >
      <summary className="cursor-pointer select-none font-semibold">
        {t("ui.debug") || "Debug"}
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <section className="grid w-full max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <span className="text-muted-foreground">
            {t("ui.debugScreenResolution")}
          </span>
          <span>{coordinates.screen}</span>
          <span className="text-muted-foreground">
            {t("ui.debugWindowPosition")}
          </span>
          <span>{coordinates.window}</span>
          <span className="text-muted-foreground">
            {t("ui.debugPointerPosition")}
          </span>
          <span>{coordinates.pointer}</span>
          <span className="text-muted-foreground">
            {t("ui.debugClickStatus")}
          </span>
          <span
            className={cn(
              isClickEnabled === true && "text-emerald-400",
              isClickEnabled === false && "text-amber-400",
            )}
          >
            {isClickEnabled === true
              ? t("ui.debugClickEnabled")
              : isClickEnabled === false
                ? t("ui.debugClickThrough")
                : t("ui.debugClickUnknown")}
          </span>
        </section>
        <section className="flex w-full max-w-xs flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="debug-state-select">
            {t("ui.debugState") || "Bartender state"}
          </label>
          <Select value={state} onValueChange={handleStateChange}>
            <SelectTrigger id="debug-state-select" font="normal">
              <SelectValue
                placeholder={t("ui.debugStatePlaceholder") || "Select state"}
                font="normal"
              />
            </SelectTrigger>
            <SelectContent {...ghostModeRegionProps} font="normal">
              {BARTENDER_STATES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
        <section className="flex w-full max-w-xs flex-col gap-2">
          <div className="text-sm font-medium">
            {t("ui.debugIdleCountdown")}
          </div>
          <div className="border border-border rounded px-3 py-2 text-sm">
            {countdownText}
          </div>
        </section>
        <section className="flex w-full max-w-md flex-col gap-2">
          <div className="text-sm font-medium">
            {t("ui.debugConversation") || "Conversation"}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void handleCopyConversation()}
              type="button"
            >
              {conversationCopyState === "copied" ? (
                <Check aria-hidden="true" className="size-3.5" />
              ) : (
                <ClipboardCopy aria-hidden="true" className="size-3.5" />
              )}
              {conversationCopyState === "copied"
                ? t("ui.debugConversationCopied") || "Copied"
                : t("ui.debugConversationCopy") || "Copy conversation"}
            </button>
            {conversationCopyState === "error" && (
              <span className="text-xs text-destructive" role="status">
                {t("ui.debugConversationCopyError") || "Copy failed"}
              </span>
            )}
          </div>
        </section>
        <section className="flex w-full flex-col gap-2">
          <div className="text-sm font-medium">
            {t("ui.debugStagedDrinks") || "Staged drinks"}
          </div>
          <div className="max-h-64 overflow-auto rounded border border-border p-3 text-xs">
            {!isTauriApp ? (
              <div className="text-muted-foreground">
                {t("ui.debugStagedDrinksUnavailable") ||
                  "Only available in the desktop app."}
              </div>
            ) : stagedDrinksError ? (
              <div className="text-destructive">{stagedDrinksError}</div>
            ) : stagedDrinks.length === 0 ? (
              <div className="text-muted-foreground">
                {t("ui.debugStagedDrinksEmpty") || "No staged drinks."}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {stagedDrinks.map((drink) => (
                  <div
                    className="border-b border-border pb-3 last:border-b-0 last:pb-0"
                    key={drink.drink_id}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-foreground">
                        {drink.drink_id}
                      </span>
                      <span className="text-muted-foreground">
                        {formatUnixSeconds(drink.modified_unix_secs)}
                      </span>
                    </div>
                    <div className="mb-2 break-all text-muted-foreground">
                      {drink.staged_dir}
                    </div>
                    <div className="flex flex-col gap-2">
                      {drink.staged_files.map((file) => (
                        <div
                          className="grid gap-1 rounded border border-border/70 p-2"
                          key={`${drink.drink_id}-${file.staged_path}`}
                        >
                          <div className="font-medium">
                            {getBasename(file.original_path)}
                          </div>
                          <div className="break-all text-muted-foreground">
                            {file.original_path}
                          </div>
                          <div className="break-all text-emerald-400">
                            → {file.staged_path}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        <section className="flex w-full flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">
              {t("ui.debugMcpCalls") || "MCP calls"}
            </div>
            <button
              className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearMcpCallHistory}
              type="button"
            >
              {t("ui.debugMcpCallsClear") || "Clear"}
            </button>
          </div>
          <div className="max-h-80 overflow-auto rounded border border-border p-3 text-xs">
            {mcpCallHistory.length === 0 ? (
              <div className="text-muted-foreground">
                {t("ui.debugMcpCallsEmpty") || "No MCP calls yet."}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {mcpCallHistory.map((entry) => (
                  <div
                    className="border-b border-border pb-3 last:border-b-0 last:pb-0"
                    key={entry.id}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-foreground">
                        {entry.tool}
                      </span>
                      <span className="text-muted-foreground">
                        {formatClockTime(entry.startedAt)}
                      </span>
                      <span
                        className={cn(
                          "font-mono",
                          entry.error
                            ? "text-destructive"
                            : entry.finishedAt
                              ? "text-emerald-400"
                              : "text-amber-400",
                        )}
                      >
                        {entry.error
                          ? t("ui.debugMcpCallsError") || "Error"
                          : entry.finishedAt
                            ? t("ui.debugMcpCallsDone") || "Done"
                            : t("ui.debugMcpCallsRunning") || "Running"}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {formatDuration(entry)}
                      </span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div>
                        <div className="mb-1 text-muted-foreground">
                          {t("ui.debugMcpCallsArgs") || "Args"}
                        </div>
                        <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all rounded border border-border/70 p-2">
                          {formatJsonPreview(entry.args)}
                        </pre>
                      </div>
                      <div>
                        <div className="mb-1 text-muted-foreground">
                          {entry.error
                            ? t("ui.debugMcpCallsError") || "Error"
                            : t("ui.debugMcpCallsResult") || "Result"}
                        </div>
                        <pre
                          className={cn(
                            "max-h-36 overflow-auto whitespace-pre-wrap break-all rounded border border-border/70 p-2",
                            entry.error && "text-destructive",
                          )}
                        >
                          {entry.error ??
                            (entry.finishedAt
                              ? formatJsonPreview(entry.result)
                              : t("ui.debugMcpCallsWaiting") || "Waiting...")}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </details>
  );
}
